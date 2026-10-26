"""Flaskアプリを生成する入口。"""

import os
import secrets
import sqlite3
from datetime import timedelta
from pathlib import Path
from dotenv import dotenv_values
from flask import Flask, jsonify, request, session, abort
from sqlalchemy import event
from sqlalchemy.engine import Engine
from sqlalchemy.exc import IntegrityError, OperationalError
from werkzeug.exceptions import HTTPException
from werkzeug.security import generate_password_hash
from flask_wtf.csrf import CSRFError
from .extensions import db, migrate, login, csrf

from .routes import api


@event.listens_for(Engine,'connect')
def sqlite_foreign_keys(connection,_):
    if isinstance(connection,sqlite3.Connection):
        connection.execute('PRAGMA foreign_keys=ON')
        connection.execute('PRAGMA busy_timeout=15000')


def create_app(config=None) -> Flask:
    """起動時・テスト時に、それぞれ独立したアプリを作る。"""
    app = Flask(__name__)
    Path(app.instance_path).mkdir(exist_ok=True)
    # 開発用の住所検索設定だけを読む。環境変数・テスト設定を優先し、本番では読まない。
    development = {} if os.getenv('D_MAP_ENV') == 'production' or (config or {}).get('TESTING') else dotenv_values(Path(__file__).resolve().parents[1] / '.env')
    for name in ('GEOCODING_URL', 'GEOCODING_REVERSE_URL', 'GEOCODING_USER_AGENT'):
        app.config[name] = os.getenv(name, development.get(name) or '')
    app.config.update(SQLALCHEMY_DATABASE_URI=os.getenv("DATABASE_URL", "sqlite:///d-map.db"),
                      SQLALCHEMY_TRACK_MODIFICATIONS=False,
                      SQLALCHEMY_ENGINE_OPTIONS={"connect_args":{"timeout":15}}, MAX_CONTENT_LENGTH=32768)
    if config:
        app.config.update(config)
    production=os.getenv('D_MAP_ENV')=='production'
    key=os.getenv('SECRET_KEY')
    if not app.config.get('SECRET_KEY'):
        if production and not key:
            raise RuntimeError('本番環境ではSECRET_KEYを設定してください。')
        if not key:
            key_path=Path(app.instance_path)/'development-secret'
            try:
                with key_path.open('x',encoding='utf-8') as stream:
                    stream.write(secrets.token_hex(32))
            except FileExistsError:
                pass
            key=key_path.read_text(encoding='utf-8')
        app.config['SECRET_KEY']=key
    if production and len(app.config['SECRET_KEY'])<32:
        raise RuntimeError('本番のSECRET_KEYは32文字以上の十分な乱数で設定してください。')
    app.config.update(SESSION_COOKIE_HTTPONLY=True,SESSION_COOKIE_SAMESITE='Lax',SESSION_COOKIE_SECURE=production,
                      SESSION_COOKIE_NAME='dmap_session',PERMANENT_SESSION_LIFETIME=timedelta(hours=8),
                      DUMMY_PASSWORD_HASH=generate_password_hash(secrets.token_hex(24),method='scrypt'))
    db.init_app(app)
    migrate.init_app(app, db, render_as_batch=True)
    login.init_app(app)
    csrf.init_app(app)
    from .models import User
    from .accounts import accounts
    app.register_blueprint(accounts)
    from .geocoding import geocoding
    app.register_blueprint(geocoding)
    from .participation import participation
    app.register_blueprint(participation)
    from .statistics import statistics
    app.register_blueprint(statistics)

    @login.user_loader
    def load_user(user_id):
        try:
            user=db.session.get(User,int(user_id))
        except (ValueError,TypeError):
            return None
        return user if user and session.get('version')==user.session_version else None

    @login.unauthorized_handler
    def unauthorized():
        return jsonify(error='ログインが必要です。'),401

    @app.before_request
    def check_origin():
        if request.method not in ('GET','HEAD','OPTIONS') and request.headers.get('Origin') not in (None,request.host_url.rstrip('/')):
            abort(403,description='送信元が一致しません。')

    @app.after_request
    def headers(response):
        response.headers['Cache-Control']='no-store'
        response.headers['X-Content-Type-Options']='nosniff'
        response.headers['Referrer-Policy']='same-origin'
        return response

    @app.errorhandler(HTTPException)
    def http_error(error):
        db.session.rollback()
        return jsonify(error=error.description),error.code

    @app.errorhandler(CSRFError)
    def csrf_error(_):
        return jsonify(error='セッションを確認できません。画面を再読み込みしてください。'),400

    @app.errorhandler(IntegrityError)
    def conflict(_):
        db.session.rollback()
        return jsonify(error='重複またはデータ整合性の競合が発生しました。'),409

    @app.errorhandler(OperationalError)
    def unavailable(_):
        db.session.rollback()
        return jsonify(error='処理が混み合っています。再試行してください。'),503
    from .seed import seed_command
    app.cli.add_command(seed_command)
    app.register_blueprint(api)
    return app
