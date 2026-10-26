"""住所検索・逆検索を同じキャッシュ/通信制限で中継する。"""
import json
from contextlib import closing
import math
import os
import re
import sqlite3
import time
from pathlib import Path
from urllib.parse import urlencode, urlsplit
from urllib.request import Request, urlopen
from flask import Blueprint, current_app, jsonify, abort
from flask_login import login_required
from .validation import body, PREFECTURES

geocoding = Blueprint('geocoding', __name__)


def endpoint_for(key):
    endpoint = current_app.config.get(key, os.getenv(key, ''))
    if not endpoint:
        abort(503, description='住所検索の接続先が未設定です。地図から指定できます。')
    try:
        url = urlsplit(endpoint)
    except ValueError:
        abort(503, description='住所検索の接続設定を確認してください。')
    if url.scheme not in ('http', 'https') or not url.netloc or url.query or url.fragment:
        abort(503, description='住所検索の接続設定を確認してください。')
    if os.getenv('D_MAP_ENV') == 'production' and url.hostname == 'nominatim.openstreetmap.org':
        abort(503, description='本番用の住所検索サービスを設定してください。公開Nominatimの本番接続は無効です。')
    return endpoint


def address_info(row):
    if not isinstance(row, dict) or not isinstance(row.get('display_name'), str) or not row['display_name'].strip():
        raise ValueError('invalid address')
    details = row.get('address', {})
    if not isinstance(details, dict):
        details = {}
    prefecture = next((details.get(key) for key in ('state', 'province') if details.get(key) in PREFECTURES), None)
    if not prefecture:
        for key, value in details.items():
            match = re.fullmatch(r'JP-(0[1-9]|[1-3][0-9]|4[0-7])', str(value)) if key.startswith('ISO3166-2-lvl') else None
            if match:
                prefecture = PREFECTURES[int(match[1])-1]
                break
    if not prefecture:
        aliases = {name[:-1] if name.endswith(('県','府','都')) else name:name for name in PREFECTURES}
        prefecture = next((aliases.get(details.get(key)) for key in ('state','province') if isinstance(details.get(key),str) and details.get(key) in aliases),None)
    return dict(label=row['display_name'][:500], prefecture=prefecture)


def provider_request(endpoint, parameters, transform):
    cache_path = current_app.config.get('GEOCODING_CACHE') or str(Path(current_app.instance_path) / 'geocoding-cache.db')
    cache_key = 'venue-v4:' + endpoint + '\n' + json.dumps(parameters, sort_keys=True, ensure_ascii=False)
    with closing(sqlite3.connect(cache_path, timeout=1)) as connection:
        connection.execute('CREATE TABLE IF NOT EXISTS cache (query TEXT PRIMARY KEY, result TEXT, expires REAL)')
        connection.execute('CREATE TABLE IF NOT EXISTS throttle (id INTEGER PRIMARY KEY, timestamp REAL)')
        connection.commit()
        # 検索/逆検索/別ワーカーも、同じファイルのロックで直列化する。
        connection.execute('BEGIN IMMEDIATE')
        now = time.time()
        connection.execute('DELETE FROM cache WHERE expires < ?', (now,))
        cached = connection.execute('SELECT result FROM cache WHERE query=?', (cache_key,)).fetchone()
        if cached:
            connection.commit()
            return json.loads(cached[0])
        last = connection.execute('SELECT timestamp FROM throttle WHERE id=1').fetchone()
        if last and now - last[0] < 1.1:
            abort(429, description='検索は少し間隔を空けて再試行してください。地図からも指定できます。')
        request = Request(endpoint + '?' + urlencode(parameters), headers={
            'User-Agent':current_app.config.get('GEOCODING_USER_AGENT') or 'd-map/1.0 (venue picker; https://github.com/kinnnnnnno/D-Map)',
            'Accept':'application/json'})
        try:
            with urlopen(request, timeout=6) as response:
                raw = response.read(262145)
            if len(raw) > 262144:
                raise ValueError('oversized')
            result = transform(json.loads(raw))
        except (OSError, ValueError, TypeError, KeyError):
            connection.execute('INSERT OR REPLACE INTO throttle VALUES (1, ?)', (time.time(),))
            connection.commit()
            abort(502, description='住所検索に接続できません。時間を空けて再試行するか、地図から指定してください。')
        connection.execute('INSERT OR REPLACE INTO cache VALUES (?, ?, ?)', (cache_key, json.dumps(result), now + 3600))
        connection.execute('DELETE FROM cache WHERE rowid NOT IN (SELECT rowid FROM cache ORDER BY expires DESC LIMIT 200)')
        connection.execute('INSERT OR REPLACE INTO throttle VALUES (1, ?)', (time.time(),))
        connection.commit()
        return result


def lookup(query):
    def transform(rows):
        if not isinstance(rows, list):
            raise ValueError('invalid response')
        results = []
        for row in rows[:5]:
            lat, lon = float(row['lat']), float(row['lon'])
            if not math.isfinite(lat) or not math.isfinite(lon) or abs(lat)>90 or abs(lon)>180:
                raise ValueError('invalid coordinates')
            results.append(dict(**address_info(row), latitude=lat, longitude=lon, accuracy='unknown'))
        return results
    return provider_request(endpoint_for('GEOCODING_URL'), dict(q=query,format='jsonv2',addressdetails=1,limit=5,countrycodes='jp',**{'accept-language':'ja'}), transform)


def reverse_lookup(latitude, longitude):
    def transform(row):
        if isinstance(row, dict) and 'error' in row:
            return None
        # 近隣OSMオブジェクトの座標にピンを動かさず、住所だけを返す。
        return dict(**address_info(row), latitude=latitude,longitude=longitude,accuracy='estimated')
    return provider_request(endpoint_for('GEOCODING_REVERSE_URL'), dict(lat=latitude,lon=longitude,format='jsonv2',addressdetails=1,zoom=18,**{'accept-language':'ja'}),transform)


def geocoding_response(action):
    try:
        return jsonify(action())
    except sqlite3.OperationalError:
        abort(503, description='住所検索が混み合っています。少し待つか地図から指定してください。')


@geocoding.post('/api/geocode', strict_slashes=False)
@login_required
def search_places():
    query = body().get('query')
    if not isinstance(query, str) or not 2 <= len(query.strip()) <= 200:
        abort(400, description='開催場所の住所を2〜200文字で入力してください。')
    return geocoding_response(lambda:lookup(query.strip()))


@geocoding.post('/api/reverse-geocode', strict_slashes=False)
@login_required
def reverse_place():
    data = body()
    lat,lon=data.get('latitude'),data.get('longitude')
    if any(type(v) not in (int,float) or not math.isfinite(v) for v in (lat,lon)) or abs(lat)>90 or abs(lon)>180:
        abort(400,description='緯度・経度を正しい範囲で指定してください。')
    return geocoding_response(lambda:reverse_lookup(lat,lon))
