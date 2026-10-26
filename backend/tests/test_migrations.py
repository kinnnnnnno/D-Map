from pathlib import Path
from flask_migrate import upgrade
from sqlalchemy import inspect
from app import create_app
from app.extensions import db


def test_fresh_migrations_keep_constraints(tmp_path):
    app=create_app({'TESTING':True,'SECRET_KEY':'tests-only','SQLALCHEMY_DATABASE_URI':f'sqlite:///{tmp_path / "migration.db"}'})
    with app.app_context():
        upgrade(directory=str(Path(__file__).resolve().parents[1]/'migrations'))
        schema=inspect(db.engine)
        assert {'event','user','group','membership','invitation'}<=set(schema.get_table_names())
        assert {'ck_event_fee_nonnegative','ck_event_visibility','ck_event_status','ck_event_group_required','ck_event_capacity'}<= {row['name'] for row in schema.get_check_constraints('event')}
        db.session.remove()
        db.engine.dispose()


def test_production_requires_secret(monkeypatch):
    import pytest
    monkeypatch.setenv('D_MAP_ENV','production')
    monkeypatch.delenv('SECRET_KEY',raising=False)
    with pytest.raises(RuntimeError,match='SECRET_KEY'):
        create_app()
    monkeypatch.setenv('SECRET_KEY','weak')
    with pytest.raises(RuntimeError,match='SECRET_KEY'):
        create_app()
