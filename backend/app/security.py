from flask import abort
from flask_login import current_user
from sqlalchemy import or_, select
from sqlalchemy import text as sql
from functools import wraps
from flask import session
from .extensions import db
from .models import Event, Membership


def write_transaction(function):
    @wraps(function)
    def wrapped(*args,**kwargs):
        # user_loaderの読み取りを終了し、検査より前にSQLiteの書き込み権を取得。
        db.session.rollback()
        db.session.execute(sql('BEGIN IMMEDIATE'))
        if current_user.is_authenticated and current_user.session_version != session.get('version'):
            abort(401)
        return function(*args,**kwargs)
    return wrapped


def visible_events():
    """一覧・地図用データ・詳細・参加・統計の共通境界。"""
    condition = Event.visibility == 'public'
    if current_user.is_authenticated:
        groups = select(Membership.group_id).where(Membership.user_id == current_user.id)
        condition = or_(condition, (Event.visibility == 'group') & Event.group_id.in_(groups))
    return select(Event).where(condition)


def visible_event(event_id):
    row = db.session.scalar(visible_events().where(Event.id == event_id))
    if row is None:
        abort(404, description='イベントが見つかりません。')
    return row


def member(group_id, admin=False):
    row = db.session.get(Membership,(group_id,current_user.id)) if current_user.is_authenticated else None
    if row is None:
        abort(404, description='グループが見つかりません。')
    if admin and row.role != 'admin':
        abort(403, description='管理者のみ操作できます。')
    return row


def can_manage(event):
    if not current_user.is_authenticated:
        abort(401)
    if event.visibility == 'group':
        member(event.group_id,admin=True)
    elif event.creator_id != current_user.id:
        abort(403, description='作成者本人のみ操作できます。')
