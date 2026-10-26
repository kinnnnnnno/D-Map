import hashlib
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from flask import Blueprint, jsonify, session, abort, url_for
from flask_login import current_user, login_user, logout_user, login_required
from flask_wtf.csrf import generate_csrf
from werkzeug.security import generate_password_hash, check_password_hash
from .extensions import db
from .models import User, Group, Membership, Invitation
from .security import member, write_transaction
from .validation import body, profile, credentials, text

accounts = Blueprint('accounts',__name__,url_prefix='/api')


@accounts.get('/auth/session')
def auth_session():
    return jsonify(user=current_user.private_profile() if current_user.is_authenticated else None, csrfToken=generate_csrf())


def start_session(user):
    session.clear()
    login_user(user)
    session['version']=user.session_version
    session.permanent=True
    return jsonify(user=user.private_profile(),csrfToken=generate_csrf())


@accounts.post('/auth/register')
def register():
    if current_user.is_authenticated:
        abort(409,description='ログアウトしてから登録してください。')
    data=body()
    email,password=credentials(data)
    fields=profile(data)
    if db.session.scalar(db.select(User).where(User.email==email)):
        abort(409,description='登録できません。入力情報を確認してください。')
    user=User(email=email,password_hash=generate_password_hash(password,method='scrypt'),**fields)
    db.session.add(user)
    db.session.commit()
    return start_session(user),201


@accounts.post('/auth/login')
def login_route():
    email,password=credentials(body())
    user=db.session.scalar(db.select(User).where(User.email==email))
    # 存在しないメールも同じハッシュ検証を行い、簡単な時間差を緩和。
    from flask import current_app
    if not check_password_hash(user.password_hash if user else current_app.config['DUMMY_PASSWORD_HASH'],password) or not user:
        abort(401,description='メールアドレスまたはパスワードが違います。')
    return start_session(user)


@accounts.post('/auth/logout')
@login_required
@write_transaction
def logout_route():
    current_user.session_version += 1
    db.session.commit()
    logout_user()
    session.clear()
    return jsonify(message='ログアウトしました。')


@accounts.get('/profile')
@login_required
def get_profile():
    return jsonify(current_user.private_profile())


@accounts.put('/profile')
@login_required
@write_transaction
def update_profile():
    for key,value in profile(body()).items():
        setattr(current_user,key,value)
    db.session.commit()
    return jsonify(current_user.private_profile())


@accounts.get('/groups')
@login_required
def groups():
    rows=db.session.execute(db.select(Group,Membership.role).join(Membership).where(Membership.user_id==current_user.id)).all()
    return jsonify([dict(id=group.id,name=group.name,role=role) for group,role in rows])


@accounts.post('/groups')
@login_required
@write_transaction
def create_group():
    group=Group(name=text(body(),'name',80),created_by=current_user.id)
    db.session.add(group)
    db.session.flush()
    db.session.add(Membership(group_id=group.id,user_id=current_user.id,role='admin'))
    db.session.commit()
    return jsonify(id=group.id,name=group.name,role='admin'),201


@accounts.get('/groups/<int:group_id>/members')
@login_required
def members(group_id):
    member(group_id)
    rows=db.session.execute(db.select(User,Membership.role).join(Membership).where(Membership.group_id==group_id)).all()
    return jsonify([dict(id=user.id,dancerName=user.dancer_name,role=role) for user,role in rows])


@accounts.post('/groups/<int:group_id>/invitations')
@login_required
@write_transaction
def invite(group_id):
    member(group_id,admin=True)
    token=secrets.token_urlsafe(32)
    expires=(datetime.now(timezone.utc)+timedelta(hours=24)).isoformat()
    invitation=Invitation(id=str(uuid.uuid4()),group_id=group_id,token_hash=hashlib.sha256(token.encode()).hexdigest(),expires_at=expires)
    db.session.add(invitation)
    db.session.commit()
    # トークンは作成時のみ返す。URLフラグメントならHTTPログ/Refererへ送られない。
    return jsonify(id=invitation.id,code=token,path='/#invite='+token,expiresAt=expires),201


@accounts.get('/groups/<int:group_id>/invitations')
@login_required
def invitation_list(group_id):
    member(group_id,admin=True)
    rows=db.session.scalars(db.select(Invitation).where(Invitation.group_id==group_id)).all()
    return jsonify([dict(id=row.id,expiresAt=row.expires_at,revoked=row.revoked) for row in rows])


@accounts.delete('/groups/<int:group_id>/invitations/<invitation_id>')
@login_required
@write_transaction
def revoke(group_id,invitation_id):
    member(group_id,admin=True)
    row=db.session.get(Invitation,invitation_id)
    if not row or row.group_id!=group_id:
        abort(404)
    row.revoked=True
    db.session.commit()
    return jsonify(message='招待を無効化しました。')


@accounts.post('/groups/join')
@login_required
@write_transaction
def join():
    token=text(body(),'code',100)
    row=db.session.scalar(db.select(Invitation).where(Invitation.token_hash==hashlib.sha256(token.encode()).hexdigest()))
    if not row or row.revoked or datetime.fromisoformat(row.expires_at)<=datetime.now(timezone.utc):
        abort(400,description='招待が無効、または期限切れです。')
    existing=db.session.get(Membership,(row.group_id,current_user.id))
    if not existing:
        db.session.add(Membership(group_id=row.group_id,user_id=current_user.id,role='member'))
        db.session.commit()
    return jsonify(message='グループに参加しました。')
