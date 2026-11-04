import pytest
from app.validation import address_prefecture
from tools.geocoding_comparison import variants, distance_meters, assess
from .helpers import register, send, event_payload


@pytest.mark.parametrize('address,expected', [
    ('東京都テスト1-2-3','東京都'), ('神奈川県横浜市テスト','神奈川県'),
    ('〒０００－００００ 神奈川県横浜市テスト','神奈川県'),
    ('千葉県テスト','千葉県'), ('埼玉県テスト','埼玉県'), ('会場付近',None),
])
def test_address_prefecture(address, expected):
    assert address_prefecture(address) == expected


def test_event_saved_coordinates_and_prefecture_are_preserved(client):
    register(client)
    payload=event_payload(address='神奈川県横浜市の架空会場',prefecture='神奈川県',latitude=35.45,longitude=139.64)
    response=send(client,'/api/events',payload)
    assert response.status_code == 201
    row=response.get_json()
    actual=client.get('/api/events/'+row['id']).get_json()
    assert (actual['prefecture'],actual['latitude'],actual['longitude']) == ('神奈川県',35.45,139.64)
    bad=send(client,'/api/events/'+row['id'],payload|{'prefecture':'東京都'},method='put')
    assert bad.status_code == 400
    assert client.get('/api/events/'+row['id']).get_json()['prefecture'] == '神奈川県'


def test_prefecture_supplement_is_allowed_but_mismatch_rejected(client):
    register(client)
    assert send(client,'/api/events',event_payload(address='架空の広場',prefecture='東京都')).status_code == 201
    assert send(client,'/api/events',event_payload(address='千葉県の架空会場',prefecture='東京都')).status_code == 400
    assert send(client,'/api/events',event_payload(prefecture='')).status_code == 400


def test_comparison_never_invents_reference_distance_or_chome():
    point={'latitude':35,'longitude':139}
    assert distance_meters(point,None) is None
    assert distance_meters(point,point) == 0
    assert distance_meters(point,{'latitude':36,'longitude':139}) == pytest.approx(111195.1,abs=1)
    assert variants({'prefix':'神奈川県横浜市日本大通','numbers':[1]})['chome'] is None
    assert assess(8,None,None,True) == '精度検証不可'
    assert assess(3,point,0,True) == '街区・町丁目付近（サービス分類）'
    assert assess(2,point,0,True) == '市区町村程度（サービス分類）'


def test_offline_report_preserves_recorded_evidence(tmp_path, monkeypatch):
    import tools.geocoding_comparison as comparison
    output=tmp_path/'docs/fixtures/geocoding-geolonia-results.json'
    output.parent.mkdir(parents=True)
    original='{"at":"fixed-observation","rows":[]}'
    output.write_text(original,encoding='utf-8')
    monkeypatch.setattr(comparison,'ROOT',tmp_path)
    comparison.report()
    assert output.read_text(encoding='utf-8') == original
