from app.extensions import db
from app.models import Event, User, Group
from app.seed import seed_events


def test_public_events(client):
    data = client.get('/api/events').get_json()
    assert len(data) == 15
    assert all(row['visibility'] == 'public' for row in data)
    assert all(row['startAt'].endswith('+00:00') for row in data)
    assert len([row for row in data if row['prefecture'] == '神奈川県']) == 2


def test_trailing_slash(client):
    assert client.get('/api/events/').get_json() == client.get('/api/events').get_json()


def test_detail_and_private_boundary(app, client):
    with app.app_context():
        user=User(email='hidden@example.invalid',password_hash='unused',dancer_name='架空')
        db.session.add(user);db.session.flush()
        group=Group(name='非公開テスト',created_by=user.id)
        db.session.add(group);db.session.flush()
        row = db.session.get(Event,'1')
        row.visibility = 'group'
        row.group_id = group.id
        db.session.commit()
    assert client.get('/api/events/1').status_code == 404
    assert len(client.get('/api/events').get_json()) == 14
    assert client.get('/api/events/missing').status_code == 404


def test_seed_idempotent(app):
    with app.app_context():
        row = db.session.get(Event,'1')
        before = row.start_at
        row.title = '編集を保持'
        db.session.commit()
        seed_events()
        assert db.session.scalar(db.select(db.func.count()).select_from(Event)) == 15
        assert db.session.get(Event,'1').title == '編集を保持'
        assert db.session.get(Event,'1').start_at == before


def test_unauthenticated_writes_denied(client):
    from .helpers import send
    assert send(client,'/api/events',{}).status_code == 401
