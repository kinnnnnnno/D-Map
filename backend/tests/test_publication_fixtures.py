"""公開fixtureは実在住所・実測値の再現ではなく、架空の回帰データ。"""
import json
import pytest
from tools import trace_geocoding


def test_public_trace_is_explicitly_synthetic():
    data = json.loads(trace_geocoding.FIXTURE.read_text(encoding='utf-8'))
    assert data['dataKind'] == 'synthetic-regression'
    assert data['measuredAt'] is None and data['externalRequests'] == 0
    assert not (trace_geocoding.FIXTURE.parent/'bug027-trace.json').exists()
    for run in data['runs']:
        assert run['input'].startswith('神奈川県架空市テスト区検証町')
        assert run['flaskJson'][0]['latitude'] == 35.000001
        assert run['flaskJson'][0]['longitude'] == 139.000002
        assert '架空' in run['flaskJson'][0]['label']


def test_trace_tool_uses_fake_provider_and_temporary_cache():
    report = trace_geocoding.trace_synthetic()
    fixture = json.loads(trace_geocoding.FIXTURE.read_text(encoding='utf-8'))
    assert report['externalRequests'] == 0 and report['mockedProviderCalls'] == 3
    for actual, expected in zip(report['runs'], fixture['runs'], strict=True):
        assert actual['status'] == 200 and actual['flaskJson'] == expected['flaskJson']


def test_trace_tool_refuses_live_requests():
    with pytest.raises(SystemExit) as error:
        trace_geocoding.main(['--live'])
    assert error.value.code == 2
