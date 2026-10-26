import io
import json
from urllib.error import URLError, HTTPError
from types import SimpleNamespace
from .helpers import register, send


def configure(app, tmp_path):
    app.config.update(GEOCODING_URL='https://geocoder.example.invalid/search', GEOCODING_REVERSE_URL='https://geocoder.example.invalid/reverse', GEOCODING_CACHE=str(tmp_path/'geo.db'))


def test_search_requires_login_and_csrf(client):
    assert send(client,'/api/geocode',{'query':'架空施設'}).status_code==401
    register(client)
    assert client.post('/api/geocode',json={'query':'架空施設'}).status_code==400


def test_unconfigured_and_bad_query(app,client):
    app.config['GEOCODING_URL']=''
    register(client)
    assert send(client,'/api/geocode',{'query':'架空施設'}).status_code==503
    for query in ['', 'x', 35, 'x'*201]:
        assert send(client,'/api/geocode',{'query':query}).status_code==400


def test_candidates_cache_and_rate_limit(app,client,tmp_path,monkeypatch):
    configure(app,tmp_path)
    register(client)
    calls=[]
    clock=[1000.0]
    monkeypatch.setattr('app.geocoding.time',SimpleNamespace(time=lambda:clock[0]))
    def fetch(request,timeout):
        calls.append(request)
        assert timeout==6
        clock[0]+=5  # 応答が遅くても「終了後」の間隔が必要。
        assert 'addressdetails=1' in request.full_url
        return io.BytesIO(json.dumps([dict(lat='35.69',lon='139.7',display_name='架空施設',address={'state':'東京都'})]).encode())
    monkeypatch.setattr('app.geocoding.urlopen',fetch)
    first=send(client,'/api/geocode',{'query':'架空施設'})
    assert first.get_json()==[dict(latitude=35.69,longitude=139.7,label='架空施設',prefecture='東京都',accuracy='unknown')]
    assert send(client,'/api/geocode',{'query':'架空施設'}).status_code==200
    assert len(calls)==1
    assert 'd-map' in calls[0].get_header('User-agent')
    assert send(client,'/api/geocode',{'query':'別の施設'}).status_code==429


def test_search_failure_still_throttled(app,client,tmp_path,monkeypatch):
    configure(app,tmp_path)
    register(client)
    def fail(*args,**kwargs):
        raise URLError('offline')
    monkeypatch.setattr('app.geocoding.urlopen',fail)
    assert send(client,'/api/geocode',{'query':'架空施設'}).status_code==502
    assert send(client,'/api/geocode',{'query':'別の施設'}).status_code==429


def test_no_candidates(app,client,tmp_path,monkeypatch):
    configure(app,tmp_path)
    register(client)
    monkeypatch.setattr('app.geocoding.urlopen',lambda *args,**kwargs:io.BytesIO(b'[]'))
    assert send(client,'/api/geocode',{'query':'架空施設'}).get_json()==[]


def test_registered_route_and_trailing_slash(app,client):
    # 古い起動プロセスにはこのルートがなく404になる。最新アプリでは登録済み。
    for path in ['/api/geocode','/api/geocode/']:
        assert client.options(path).status_code==200
        assert send(client,path,{'query':'東京都渋谷区'}).status_code==401


def test_upstream_404_is_localized_not_forwarded(app,client,tmp_path,monkeypatch):
    configure(app,tmp_path); register(client)
    def missing(*args,**kwargs):
        raise HTTPError('https://geocoder.example.invalid/search',404,'not found',{},None)
    monkeypatch.setattr('app.geocoding.urlopen',missing)
    response=send(client,'/api/geocode',{'query':'東京都渋谷区'})
    assert response.status_code==502
    assert '地図から指定' in response.get_json()['error']
    assert 'not found' not in response.get_json()['error']


def test_unknown_precision_and_prefecture(app,client,tmp_path,monkeypatch):
    configure(app,tmp_path); register(client)
    monkeypatch.setattr('app.geocoding.urlopen',lambda *a,**k:io.BytesIO(json.dumps([
        dict(lat='35.45',lon='139.64',display_name='日本、神奈川県横浜市の架空住所',address={'state':'神奈川県'}),
        dict(lat='35.6',lon='139.7',display_name='所在地不詳の架空施設',address={})
    ]).encode()))
    rows=send(client,'/api/geocode',{'query':'架空住所'}).get_json()
    assert rows[0]['prefecture']=='神奈川県'
    assert rows[0]['label']=='日本、神奈川県横浜市の架空住所'
    assert rows[1]['prefecture'] is None
    assert all(row['accuracy']=='unknown' for row in rows)

def test_reverse_returns_estimate_without_moving_selected_point(app,client,tmp_path,monkeypatch):
    configure(app,tmp_path); register(client)
    calls=[]
    def fetch(request,timeout):
        calls.append(request.full_url)
        return io.BytesIO(json.dumps(dict(lat='35.7',lon='139.8',display_name='東京都の架空推定住所',address={'state':'東京都'})).encode())
    monkeypatch.setattr('app.geocoding.urlopen',fetch)
    response=send(client,'/api/reverse-geocode',{'latitude':35.65,'longitude':139.7})
    assert response.status_code==200
    assert response.get_json()==dict(latitude=35.65,longitude=139.7,label='東京都の架空推定住所',prefecture='東京都',accuracy='estimated')
    assert send(client,'/api/reverse-geocode',{'latitude':35.65,'longitude':139.7}).status_code==200
    assert len(calls)==1
    assert '/reverse?' in calls[0]
    assert send(client,'/api/geocode',{'query':'別の住所'}).status_code==429


def test_reverse_requires_auth_csrf_and_coordinates(app,client,tmp_path):
    configure(app,tmp_path)
    assert send(client,'/api/reverse-geocode',{'latitude':35,'longitude':139}).status_code==401
    register(client)
    assert client.post('/api/reverse-geocode',json={'latitude':35,'longitude':139}).status_code==400
    for patch in [{'latitude':True,'longitude':139},{'latitude':91,'longitude':139},{'latitude':35,'longitude':181},{'latitude':'35','longitude':139},{}]:
        assert send(client,'/api/reverse-geocode',patch).status_code==400


def test_reverse_no_coverage_and_failure(app,client,tmp_path,monkeypatch):
    configure(app,tmp_path); register(client)
    monkeypatch.setattr('app.geocoding.urlopen',lambda *a,**k:io.BytesIO(b'{"error":"Unable to geocode"}'))
    assert send(client,'/api/reverse-geocode',{'latitude':0,'longitude':0}).get_json() is None
    # キャッシュファイルを変え、待ち時間に依存せず通信失敗を検証する。
    app.config['GEOCODING_CACHE']=str(tmp_path/'failure.db')
    def fail(*a,**k):
        raise URLError('offline')
    monkeypatch.setattr('app.geocoding.urlopen',fail)
    assert send(client,'/api/reverse-geocode',{'latitude':35,'longitude':139}).status_code==502


def test_public_provider_disabled_in_production(app,client,tmp_path,monkeypatch):
    configure(app,tmp_path); register(client)
    monkeypatch.setenv('D_MAP_ENV','production')
    app.config['GEOCODING_URL']='https://nominatim.openstreetmap.org/search'
    app.config['GEOCODING_REVERSE_URL']='https://nominatim.openstreetmap.org/reverse'
    assert send(client,'/api/geocode',{'query':'東京都渋谷区'}).status_code==503
    assert send(client,'/api/reverse-geocode',{'latitude':35,'longitude':139}).status_code==503

import pytest

@pytest.mark.parametrize('details,expected',[
    ({'ISO3166-2-lvl4':'JP-13'},'東京都'),
    ({'province':'東京'},'東京都'),
    ({'state':'京都'},'京都府'),
])
def test_provider_prefecture_names_are_normalized(details,expected):
    from app.geocoding import address_info
    assert address_info({'display_name':'公開住所','address':details})['prefecture']==expected
