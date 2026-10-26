import pytest
from app import create_app
from app.extensions import db
from app.seed import seed_events
from datetime import datetime, timezone


@pytest.fixture
def app(tmp_path):
    app = create_app({"TESTING":True,"SQLALCHEMY_DATABASE_URI":f"sqlite:///{tmp_path / 'test.db'}"})
    with app.app_context():
        db.create_all()
        seed_events(datetime(2026,10,19,tzinfo=timezone.utc))
    yield app
    with app.app_context():
        db.session.remove()
        db.engine.dispose()


@pytest.fixture
def client(app):
    return app.test_client()
