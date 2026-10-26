"""E2E専用。一時SQLite・一時鍵を使い、通常の開発DBを変更しない。"""
import secrets
from tempfile import TemporaryDirectory
from datetime import datetime, timezone
from pathlib import Path
from app import create_app
from app.extensions import db
from app.seed import seed_events

if __name__ == "__main__":
    temp_root=Path(__file__).resolve().parent / 'instance' / 'e2e'
    temp_root.mkdir(parents=True,exist_ok=True)
    with TemporaryDirectory(prefix="run-",dir=temp_root) as directory:
        app = create_app({"TESTING":True,"SECRET_KEY":secrets.token_hex(32),
                          "SQLALCHEMY_DATABASE_URI":f"sqlite:///{directory}/e2e.db"})
        with app.app_context():
            db.create_all()
            seed_events(datetime(2026,10,19,tzinfo=timezone.utc))
        try:
            app.run(host="127.0.0.1",port=5001,debug=False,use_reloader=False)
        finally:
            with app.app_context():
                db.session.remove()
                db.engine.dispose()
