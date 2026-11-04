"""すべて架空のGoogle応答を使う。外部APIへは通信しない。"""
import io
import json
import sqlite3
from urllib.error import URLError, HTTPError
from unittest.mock import Mock, MagicMock
import pytest
from tools import evaluate_google_geocoding as evaluation

KEY = 'test-only-secret-not-an-api-key'


def candidate(kind='ROOFTOP', **patch):
    return dict(formatted_address='東京都の架空施設1-2-3',
                geometry=dict(location=dict(lat=35.7, lng=139.8), location_type=kind)) | patch


def run(**patch):
    options = dict(live=True, allow_paid=True, quota_confirmed=True, terms_reviewed=True,
                   terminal=True, environment={'GOOGLE_GEOCODING_API_KEY': KEY},
                   fetch=lambda *a: (200, {'status':'OK', 'results':[candidate()]}), sleep=lambda _:None)
    return evaluation.evaluate(**(options | patch))


@pytest.mark.parametrize('patch', [
    {'environment':{}}, {'live':False}, {'allow_paid':False},
    {'quota_confirmed':False}, {'terms_reviewed':False}, {'terminal':False},
])
def test_each_gate_prevents_network(patch):
    fetch = Mock(side_effect=AssertionError('network prohibited'))
    report = run(fetch=fetch, **patch)
    assert report['mode'] == 'not-measured' and report['requests'] == 0
    fetch.assert_not_called()
    assert KEY not in json.dumps(report)


@pytest.mark.parametrize('limit', [0, 11, -1, True])
def test_rejects_invalid_limit(limit):
    fetch = Mock()
    with pytest.raises(ValueError):
        run(limit=limit, fetch=fetch)
    fetch.assert_not_called()


def test_ten_public_facilities_only_with_bounded_spacing():
    fetch = Mock(return_value=(200, {'status':'ZERO_RESULTS', 'results':[]}))
    sleep = Mock()
    report = run(limit=10, fetch=fetch, sleep=sleep)
    assert report['requests'] == fetch.call_count == 10
    assert len(report['results']) == 10 and sleep.call_count == 9
    assert all(call.args == (1.1,) for call in sleep.call_args_list)
    assert all('検証町' not in call.args[0] for call in fetch.call_args_list)
    with pytest.raises(ValueError):
        run(facility='arbitrary-private-address')


@pytest.mark.parametrize('status', ['OVER_QUERY_LIMIT', 'OVER_DAILY_LIMIT', 'REQUEST_DENIED', 'INVALID_REQUEST', 'UNKNOWN_ERROR'])
def test_api_errors_stop_without_retry_or_message_leak(status):
    fetch = Mock(return_value=(200, {'status':status, 'error_message':'key='+KEY}))
    report = run(limit=10, fetch=fetch)
    assert fetch.call_count == report['requests'] == 1
    assert report['results'][0]['status'] == status
    assert KEY not in json.dumps(report)


@pytest.mark.parametrize('http', [301, 403, 429, 500])
def test_http_errors_stop(http):
    fetch = Mock(return_value=(http, None))
    report = run(limit=10, fetch=fetch)
    assert report['results'][0]['httpStatus'] == http
    assert report['results'][0]['status'] == 'HTTP_ERROR' and fetch.call_count == 1


def test_timeout_and_exception_do_not_log_url_or_key(capsys):
    fetch = Mock(side_effect=URLError('https://example.invalid/?key='+KEY))
    report = run(limit=10, fetch=fetch)
    assert report['results'][0]['status'] == 'COMMUNICATION_OR_RESPONSE_ERROR'
    assert KEY not in json.dumps(report)
    assert capsys.readouterr() == ('', '')


@pytest.mark.parametrize('kind', ['ROOFTOP', 'RANGE_INTERPOLATED', 'GEOMETRIC_CENTER', 'APPROXIMATE', 'future-type'])
def test_location_classification_never_proves_entrance(kind):
    row = evaluation.assess_result(candidate(kind), '東京都の架空施設1-2-3', None)
    assert row['location_type'] == (kind if kind in evaluation.TYPES else 'UNKNOWN')
    assert row['distanceMeters'] is None and row['distanceStatus'] == '距離検証不可'
    assert row['buildingEntranceVerified'] is False


def test_partial_match_and_address_match_are_separate_from_coordinates():
    partial = evaluation.assess_result(candidate(partial_match=True), '東京都の架空施設1-2-3', None)
    assert partial['partial_match'] is True and partial['partial_match_present'] is True
    assert partial['addressTextMatched'] is None
    exact = evaluation.assess_result(candidate(), '東京都の架空施設1-2-3', None)
    assert exact['addressTextMatched'] is True and exact['houseNumberVerified'] is None
    assert exact['partial_match_present'] is False


def test_reference_distance_only_when_independently_supplied():
    row = evaluation.assess_result(candidate(), '架空', {'latitude':35.7, 'longitude':139.8})
    assert row['distanceMeters'] == 0 and row['buildingEntranceVerified'] is False


def test_redacts_reflected_key_including_quotes():
    key = 'test"quoted-key'
    report = run(environment={'GOOGLE_GEOCODING_API_KEY':key},
                 fetch=lambda *a:(200, {'status':'OK', 'results':[candidate(formatted_address=key)]}))
    assert report['results'][0]['candidates'][0]['formatted_address'] == '[REDACTED]'
    assert key not in json.dumps(report)


def test_no_database_or_file_writes(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    connect = Mock(side_effect=AssertionError('DB access prohibited'))
    monkeypatch.setattr(sqlite3, 'connect', connect)
    assert run()['requests'] == 1
    connect.assert_not_called()
    assert list(tmp_path.iterdir()) == []


def test_changed_fixture_is_rejected(tmp_path, monkeypatch):
    path = tmp_path/'changed.json'
    path.write_text('[]', encoding='utf-8')
    monkeypatch.setattr(evaluation, 'FIXTURE', path)
    with pytest.raises(ValueError):
        run()


def test_cli_default_never_uses_network_or_prints_key(monkeypatch, capsys):
    monkeypatch.setenv('GOOGLE_GEOCODING_API_KEY', KEY)
    fetch = Mock(side_effect=AssertionError('network prohibited'))
    monkeypatch.setattr(evaluation, 'transport', fetch)
    assert evaluation.main([]) == 0
    output = capsys.readouterr()
    assert KEY not in output.out and json.loads(output.out)['requests'] == 0
    fetch.assert_not_called()


def test_transport_encodes_request_and_caps_response(monkeypatch):
    opener = MagicMock()
    opener.open.return_value.__enter__.return_value = type('Response', (), {'status':200, 'read':lambda self,n:b'{"status":"ZERO_RESULTS"}'})()
    monkeypatch.setattr(evaluation, 'build_opener', lambda *a:opener)
    assert evaluation.transport('東京都の架空施設', KEY) == (200, {'status':'ZERO_RESULTS'})
    assert opener.open.call_args.kwargs['timeout'] == 6
    assert opener.open.call_args.args[0].full_url.startswith(evaluation.ENDPOINT+'?')
    assert evaluation.NoRedirect().redirect_request(None, None, None, None, None, None) is None


def test_http_error_does_not_return_provider_body(monkeypatch):
    opener = Mock()
    opener.open.side_effect = HTTPError('https://example.invalid/?key='+KEY, 429, KEY, {}, io.BytesIO(KEY.encode()))
    monkeypatch.setattr(evaluation, 'build_opener', lambda *a:opener)
    assert evaluation.transport('架空', KEY) == (429, None)


@pytest.mark.parametrize('data', [None, {'status':'OK','results':[]}, {'status':'OK','results':[{'geometry':{'location':{'lat':99,'lng':139}}}]}])
def test_invalid_response_is_safe(data):
    report = run(fetch=lambda *a:(200,data))
    assert report['results'][0]['status'] in ('INVALID_RESPONSE', 'COMMUNICATION_OR_RESPONSE_ERROR')
