"""Offline BUG-027 regression trace using explicitly fictional data.

No external provider or ordinary application DB/cache is used.
The original measurement is private and is not needed to run this tool.
"""
import argparse
import io
import json
from pathlib import Path
import secrets
import sys
import tempfile
from types import SimpleNamespace
from unittest.mock import patch
from urllib.parse import parse_qs, urlsplit

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from app import create_app
from app.extensions import db
import app.geocoding as geo
from tests.helpers import register, send

FIXTURE = ROOT.parent / 'docs/fixtures/bug027-synthetic-trace.json'


def trace_synthetic():
    fixture = json.loads(FIXTURE.read_text(encoding='utf-8'))
    if fixture.get('dataKind') != 'synthetic-regression':
        raise ValueError('Only explicitly synthetic fixtures are accepted')
    by_query = {step['query']: step['upstream']['rows'] for step in fixture['runs'][0]['steps']}
    calls, runs, clock = [], [], [1000.0]
    def fetch(request, timeout):
        query = parse_qs(urlsplit(request.full_url).query)['q'][0]
        assert query in by_query and timeout == 6
        calls.append(query)
        return io.BytesIO(json.dumps(by_query[query]).encode())
    (ROOT / 'instance').mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory(dir=ROOT / 'instance', prefix='synthetic-trace-') as directory:
        app = create_app(dict(TESTING=True, SECRET_KEY=secrets.token_hex(32),
                              SQLALCHEMY_DATABASE_URI='sqlite:///'+str(Path(directory)/'test.db'),
                              GEOCODING_URL='https://geocoder.example.invalid/search',
                              GEOCODING_CACHE=str(Path(directory)/'cache.db')))
        with app.app_context():
            db.create_all()
        try:
            client = app.test_client()
            assert register(client).status_code == 201
            with patch.object(geo, 'urlopen', fetch), patch.object(geo, 'time', SimpleNamespace(
                    time=lambda:clock[0], sleep=lambda seconds:clock.__setitem__(0,clock[0]+seconds))):
                for item in fixture['runs']:
                    response = send(client, '/api/geocode', {'query':item['input']})
                    runs.append(dict(input=item['input'], status=response.status_code,
                                     flaskJson=response.get_json()))
        finally:
            with app.app_context():
                db.session.remove()
                db.engine.dispose()
    return dict(dataKind='synthetic-regression', externalRequests=0,
                mockedProviderCalls=len(calls), runs=runs)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--live', action='store_true', help='Unsupported: fictional data must not be sent externally')
    args = parser.parse_args(argv)
    if args.live:
        parser.error('This public tool is offline only. External requests are prohibited.')
    print(json.dumps(trace_synthetic(), ensure_ascii=False, indent=2))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
