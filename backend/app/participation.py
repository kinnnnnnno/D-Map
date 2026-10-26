from datetime import datetime, timezone
from flask import Blueprint, jsonify, abort, request
from flask_login import current_user, login_required
from .extensions import db
from .models import Attendance
from .security import visible_event, write_transaction

participation = Blueprint('participation',__name__,url_prefix='/api')


def event_views(rows):
    """一覧でも人数は一括集計し、イベント件数分の追加クエリを避ける。"""
    ids=[row.id for row in rows]
    if not ids:
        return []
    counts=dict(db.session.execute(db.select(Attendance.event_id,db.func.count()).where(Attendance.event_id.in_(ids)).group_by(Attendance.event_id)).all())
    mine=set(db.session.scalars(db.select(Attendance.event_id).where(Attendance.event_id.in_(ids),Attendance.user_id==current_user.id)).all()) if current_user.is_authenticated else set()
    return [dict(row.to_dict(),attendanceCount=counts.get(row.id,0),remainingSlots=None if row.capacity is None else max(0,row.capacity-counts.get(row.id,0)),attending=row.id in mine) for row in rows]


@participation.post('/events/<event_id>/participation')
@login_required
@write_transaction
def attend(event_id):
    row=visible_event(event_id)
    data=request.get_json(silent=True)
    if data not in (None,{}):
        abort(400,description='参加登録は本人のみ指定できます。')
    if row.status=='cancelled' or datetime.fromisoformat(row.end_at)<=datetime.now(timezone.utc):
        abort(409,description='中止・終了したイベントには参加登録できません。')
    if db.session.get(Attendance,(row.id,current_user.id)):
        abort(409,description='すでに参加予定です。')
    count=db.session.scalar(db.select(db.func.count()).select_from(Attendance).where(Attendance.event_id==row.id))
    if row.capacity is not None and count>=row.capacity:
        abort(409,description='定員に達しています。')
    db.session.add(Attendance(event_id=row.id,user_id=current_user.id))
    db.session.commit()
    return jsonify(event_views([row])[0]),201


@participation.delete('/events/<event_id>/participation')
@login_required
@write_transaction
def withdraw(event_id):
    row=visible_event(event_id)
    data=request.get_json(silent=True)
    if data not in (None,{}):
        abort(400,description='他のユーザーの参加情報は変更できません。')
    attendance=db.session.get(Attendance,(row.id,current_user.id))
    if attendance:
        db.session.delete(attendance)
    db.session.commit()
    return jsonify(event_views([row])[0])
