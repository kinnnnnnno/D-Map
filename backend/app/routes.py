"""APIのURLと、そのURLにアクセスされたときの処理。"""

from flask import Blueprint, jsonify, abort
from .models import Event
from .extensions import db
from .security import visible_events, visible_event, can_manage, member, write_transaction
from .validation import body, event_fields
from .participation import event_views
from .models import Attendance
from flask_login import login_required, current_user
import uuid

api = Blueprint("api", __name__, url_prefix="/api")


@api.get("/events", strict_slashes=False)
def events():
    rows = db.session.scalars(visible_events().order_by(Event.start_at)).all()
    return jsonify(event_views(rows))


@api.get("/events/<event_id>")
def event_detail(event_id):
    row = visible_event(event_id)
    return jsonify(event_views([row])[0])


@api.post('/events', strict_slashes=False)
@login_required
@write_transaction
def create_event():
    fields=event_fields(body())
    if fields['visibility']=='group':
        member(fields['group_id'],admin=True)
    row=Event(id=str(uuid.uuid4()),creator_id=current_user.id,**fields)
    db.session.add(row)
    db.session.commit()
    return jsonify(event_views([row])[0]),201


@api.put('/events/<event_id>')
@login_required
@write_transaction
def update_event(event_id):
    row=visible_event(event_id)
    can_manage(row)
    fields=event_fields(body())
    # 公開範囲の切替による移転・漏えいを避け、作成時の所属は固定。
    if fields['visibility']!=row.visibility or fields['group_id']!=row.group_id:
        abort(400,description='公開範囲とグループは作成後に変更できません。')
    count=db.session.scalar(db.select(db.func.count()).select_from(Attendance).where(Attendance.event_id==row.id))
    if fields['capacity'] is not None and fields['capacity']<count:
        abort(409,description='現在の参加予定人数より定員を小さくできません。')
    for key,value in fields.items():
        setattr(row,key,value)
    db.session.commit()
    return jsonify(event_views([row])[0])


@api.delete('/events/<event_id>')
@login_required
@write_transaction
def delete_event(event_id):
    row=visible_event(event_id)
    can_manage(row)
    db.session.delete(row)
    db.session.commit()
    return '',204


@api.get("/health")
def health():
    """サーバーが応答できることを確認する。DBなどの検査は行わない。"""
    return jsonify(status="ok"), 200
