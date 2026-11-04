"""公開施設10件だけの独立した評価CLI。デフォルトは通信しない。

Google由来の候補はメモリ/対話端末だけに表示し、ファイル/DBへ保存しない。
通常アプリやFlaskをimportしない。キーは環境変数だけから読む。
"""
import argparse
import hashlib
import json
import math
import os
from pathlib import Path
import re
import sys
import time
import unicodedata
from urllib.error import HTTPError
from urllib.parse import urlencode
from urllib.request import build_opener, HTTPRedirectHandler, Request

ROOT = Path(__file__).resolve().parents[2]
FIXTURE = ROOT / 'docs/fixtures/geocoding-addresses.json'
FIXTURE_HASH = '412ed344d8eb8f95042da29de8b606e66189f635064155103cb905b66a9fa114'
ENDPOINT = 'https://maps.googleapis.com/maps/api/geocode/json'
MAX_REQUESTS = 10
TYPES = {
    'ROOFTOP': '番地相当（サービス分類・入口未確認）',
    'RANGE_INTERPOLATED': '補間位置',
    'GEOMETRIC_CENTER': '形状の中心',
    'APPROXIMATE': '概略位置',
}
API_STATUSES = {'OK', 'ZERO_RESULTS', 'OVER_DAILY_LIMIT', 'OVER_QUERY_LIMIT',
                'REQUEST_DENIED', 'INVALID_REQUEST', 'UNKNOWN_ERROR'}


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        # キー付きリクエストを別の接続先へ転送しない。
        return None


def transport(address, key):
    parameters = dict(address=address, language='ja', region='jp', components='country:JP', key=key)
    request = Request(ENDPOINT+'?'+urlencode(parameters), headers={'Accept': 'application/json'})
    try:
        with build_opener(NoRedirect).open(request, timeout=6) as response:
            raw = response.read(262145)
            if len(raw) > 262144:
                return response.status, None
            return response.status, json.loads(raw)
    except HTTPError as error:
        error.close()
        return error.code, None  # URL、レスポンス本文、例外文字列は出さない。


def load_facilities():
    facilities = json.loads(FIXTURE.read_text(encoding='utf-8-sig'))
    digest = hashlib.sha256(json.dumps(facilities, ensure_ascii=True, sort_keys=True,
                                      separators=(',', ':')).encode()).hexdigest()
    if digest != FIXTURE_HASH or len(facilities) != 10:
        raise ValueError('公開施設セットが変更されています。出典と公開施設であることを再確認してください。')
    return facilities


def clean_address(value):
    """比較用のみ。サービス送信クエリは変えず、日本の国名/郵便番号等を除く。"""
    value = unicodedata.normalize('NFKC', value)
    value = re.sub(r'^(日本[、,]?\s*)?(〒\s*)?\d{3}-?\d{4}\s*', '', value)
    value = re.sub(r'^日本[、,]?\s*', '', value)
    return re.sub(r'[\s、,]', '', value)


def distance_meters(point, reference):
    if reference is None:
        return None
    lat1, lon1, lat2, lon2 = map(math.radians, (point['lat'], point['lng'],
                                               reference['latitude'], reference['longitude']))
    a = math.sin((lat2-lat1)/2)**2 + math.cos(lat1)*math.cos(lat2)*math.sin((lon2-lon1)/2)**2
    return round(6371008.8*2*math.asin(math.sqrt(min(1, a))), 1)


def assess_result(row, address, reference):
    geometry = row.get('geometry') or {}
    point = geometry.get('location') or {}
    if (any(type(point.get(k)) not in (int, float) or not math.isfinite(point[k]) for k in ('lat', 'lng'))
            or abs(point['lat']) > 90 or abs(point['lng']) > 180):
        raise ValueError('invalid coordinates')
    formatted = row.get('formatted_address')
    if not isinstance(formatted, str):
        raise ValueError('invalid address')
    kind = geometry.get('location_type')
    kind = kind if kind in TYPES else 'UNKNOWN'
    partial = row.get('partial_match') is True
    # Falseは「一致しない」とは限らず、表記差があるため未確認とする。
    address_match = True if not partial and clean_address(formatted) == clean_address(address) else None
    return dict(formatted_address=formatted, location=dict(lat=point['lat'], lng=point['lng']),
                location_type=kind, classification=TYPES.get(kind, '精度不明'),
                partial_match=partial, partial_match_present='partial_match' in row,
                addressTextMatched=address_match, houseNumberVerified=None,
                distanceMeters=distance_meters(point, reference),
                distanceStatus='距離検証不可' if reference is None else '施設代表点との概算距離（入口未確認）',
                buildingEntranceVerified=False)


def redact(value, key):
    """キーが異常応答中に反射されても、構造化出力に残さない。"""
    if not key:
        return value
    if isinstance(value, str):
        return value.replace(key, '[REDACTED]')
    if isinstance(value, list):
        return [redact(item, key) for item in value]
    if isinstance(value, dict):
        return {redact(name, key): redact(item, key) for name, item in value.items()}
    return value


def evaluate(*, live=False, allow_paid=False, quota_confirmed=False, terms_reviewed=False,
             limit=1, facility=None, environment=None, fetch=None, sleep=None, terminal=False):
    if type(limit) is not int or not 1 <= limit <= MAX_REQUESTS:
        raise ValueError('件数は1〜10件です。')
    facilities = load_facilities()
    if facility:
        facilities = [item for item in facilities if item['id'] == facility]
        if not facilities:
            raise ValueError('公開施設IDを選んでください。任意住所の指定はできません。')
    selected = facilities[:limit]
    key = (os.environ if environment is None else environment).get('GOOGLE_GEOCODING_API_KEY', '').strip()
    reasons = []
    if not live:
        reasons.append('dry-run：外部通信なし')
    if not key:
        reasons.append('GOOGLE_GEOCODING_API_KEYを環境変数へ設定してください（値は出力しません）')
    if not allow_paid:
        reasons.append('--allow-paid-requestsが必要です')
    if not quota_confirmed:
        reasons.append('--quota-confirmed：Cloud側の利用上限確認が必要です')
    if not terms_reviewed:
        reasons.append('--terms-reviewed：契約・表示・保存条件の確認が必要です')
    if not terminal:
        reasons.append('実通信結果は対話端末専用です。リダイレクト/ファイル保存はできません')
    report = dict(mode='live' if not reasons else 'not-measured', requests=0,
                  attribution='Google Maps', reasons=reasons, results=[])
    if reasons:
        report['planned'] = [dict(id=f['id'], name=f['name'], address=f['prefix']+'-'.join(map(str, f['numbers'])),
                                  source=f['source'], referenceAvailable=f['reference'] is not None) for f in selected]
        return redact(report, key)
    fetch = fetch or transport
    sleep = sleep or time.sleep
    for index, item in enumerate(selected):
        if index:
            sleep(1.1)
        address = item['prefix']+'-'.join(map(str, item['numbers']))
        result = dict(id=item['id'], input=address, normalized=address, httpStatus=None, candidates=[])
        report['results'].append(result)
        report['requests'] += 1
        try:
            http, data = fetch(address, key)
            result['httpStatus'] = http if type(http) is int else None
            if http != 200:
                result['status'] = 'HTTP_ERROR'
                break
            status = data.get('status') if isinstance(data, dict) else None
            result['status'] = status if status in API_STATUSES else 'INVALID_RESPONSE'
            if status == 'ZERO_RESULTS':
                continue
            if status != 'OK':
                break  # 課金拒否・制限・一時障害も再試行しない。
            rows = data.get('results')
            if not isinstance(rows, list) or not rows:
                raise ValueError('invalid response')
            result['candidates'] = [assess_result(row, address, item['reference']) for row in rows[:5]]
            result['candidateCount'] = len(rows)
        except (OSError, ValueError, TypeError, KeyError, AttributeError):
            result['status'] = 'COMMUNICATION_OR_RESPONSE_ERROR'
            break
    return redact(report, key)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--live', action='store_true')
    parser.add_argument('--allow-paid-requests', dest='allow_paid', action='store_true')
    parser.add_argument('--quota-confirmed', action='store_true')
    parser.add_argument('--terms-reviewed', action='store_true')
    parser.add_argument('--limit', type=int, default=1)
    parser.add_argument('--facility', help='公開施設セットのid（任意住所は不可）')
    args = parser.parse_args(argv)
    try:
        report = evaluate(**vars(args), terminal=sys.stdout.isatty())
    except ValueError:
        print('設定を確認してください。件数は1〜10件、対象は既存の公開施設だけです。')
        return 2
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if report['mode'] == 'not-measured' or all(r['status'] in ('OK', 'ZERO_RESULTS') for r in report['results']) else 1


if __name__ == '__main__':
    raise SystemExit(main())
