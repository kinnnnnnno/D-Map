"""DB時刻はUTCのISO 8601文字列。SQLiteによるtzinfoの消失を避ける。"""
from datetime import datetime, timezone
from .extensions import db
from flask_login import UserMixin


def utcnow():
    return datetime.now(timezone.utc).isoformat()


class Event(db.Model):
    id = db.Column(db.String(36), primary_key=True)
    title = db.Column(db.String(120), nullable=False)
    type = db.Column(db.String(30), nullable=False)
    genre = db.Column(db.String(30), nullable=False)
    start_at = db.Column(db.String(40), nullable=False)
    end_at = db.Column(db.String(40), nullable=False)
    prefecture = db.Column(db.String(10), nullable=False)
    venue_name = db.Column(db.String(120), nullable=False)
    address = db.Column(db.String(250), nullable=False)
    latitude = db.Column(db.Float, nullable=False)
    longitude = db.Column(db.Float, nullable=False)
    fee_yen = db.Column(db.Integer, nullable=False, default=0)
    organizer_name = db.Column(db.String(80), nullable=False)
    participation_rule = db.Column(db.String(500), nullable=False)
    description = db.Column(db.Text, nullable=False)
    visibility = db.Column(db.String(10), nullable=False, default="public", index=True)
    group_id = db.Column(db.Integer, db.ForeignKey('group.id', ondelete='CASCADE'), nullable=True)
    creator_id = db.Column(db.Integer, db.ForeignKey('user.id', ondelete='SET NULL'), nullable=True)
    is_demo = db.Column(db.Boolean, nullable=False, default=False, server_default=db.false())
    capacity = db.Column(db.Integer, nullable=True)
    walk_ins = db.Column(db.Boolean, nullable=False, default=False, server_default=db.false())
    status = db.Column(db.String(15), nullable=False, default="scheduled")
    created_at = db.Column(db.String(40), nullable=False, default=utcnow)
    updated_at = db.Column(db.String(40), nullable=False, default=utcnow, onupdate=utcnow)
    __table_args__ = (
        db.CheckConstraint("fee_yen >= 0", name='ck_event_fee_nonnegative'),
        db.CheckConstraint("visibility IN ('public','group')", name='ck_event_visibility'),
        db.CheckConstraint("status IN ('scheduled','cancelled')", name='ck_event_status'),
        db.CheckConstraint("visibility = 'public' OR group_id IS NOT NULL", name='ck_event_group_required'),
        db.CheckConstraint('capacity IS NULL OR capacity > 0', name='ck_event_capacity'),
    )

    def to_dict(self):
        fields = {"start_at":"startAt", "end_at":"endAt", "venue_name":"venueName",
                  "fee_yen":"feeYen", "organizer_name":"organizerName",
                  "participation_rule":"participationRule", "group_id":"groupId",
                  "creator_id":"creatorId", "created_at":"createdAt", "updated_at":"updatedAt", "is_demo":"isDemo", "walk_ins":"walkIns"}
        names = ["id","title","type","genre","start_at","end_at","prefecture","venue_name",
                 "address","latitude","longitude","fee_yen","organizer_name","participation_rule",
                 "description","visibility","group_id","creator_id","status","created_at","updated_at","is_demo","capacity","walk_ins"]
        return {fields.get(name,name):getattr(self,name) for name in names}


class User(UserMixin, db.Model):
    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(254), nullable=False, unique=True)
    password_hash = db.Column(db.Text, nullable=False)
    dancer_name = db.Column(db.String(60), nullable=False)
    main_genre = db.Column(db.String(30), nullable=True)
    sub_genres = db.Column(db.JSON, nullable=False, default=list)
    activity_region = db.Column(db.String(10), nullable=True)
    birth_date = db.Column(db.String(10), nullable=True)
    birth_year = db.Column(db.Integer, nullable=True)
    age_consent = db.Column(db.Boolean, nullable=False, default=False)
    genre_consent = db.Column(db.Boolean, nullable=False, default=False)
    session_version = db.Column(db.Integer, nullable=False, default=0)
    created_at = db.Column(db.String(40), nullable=False, default=utcnow)

    def private_profile(self):
        return dict(id=self.id,email=self.email,dancerName=self.dancer_name,mainGenre=self.main_genre,
                    subGenres=self.sub_genres,activityRegion=self.activity_region,birthDate=self.birth_date,
                    birthYear=self.birth_year,ageStatsConsent=self.age_consent,genreStatsConsent=self.genre_consent)


class Group(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(80), nullable=False)
    created_by = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    created_at = db.Column(db.String(40), nullable=False, default=utcnow)


class Membership(db.Model):
    group_id = db.Column(db.Integer, db.ForeignKey('group.id', ondelete='CASCADE'), primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id', ondelete='CASCADE'), primary_key=True)
    role = db.Column(db.String(10), nullable=False, default='member')
    __table_args__ = (db.CheckConstraint("role IN ('admin','member')"),)


class Invitation(db.Model):
    id = db.Column(db.String(36), primary_key=True)
    group_id = db.Column(db.Integer, db.ForeignKey('group.id', ondelete='CASCADE'), nullable=False)
    token_hash = db.Column(db.String(64), unique=True, nullable=False)
    expires_at = db.Column(db.String(40), nullable=False)
    revoked = db.Column(db.Boolean, nullable=False, default=False)


class Attendance(db.Model):
    event_id = db.Column(db.String(36), db.ForeignKey('event.id',ondelete='CASCADE'), primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id',ondelete='CASCADE'), primary_key=True)
    created_at = db.Column(db.String(40), nullable=False, default=utcnow)
