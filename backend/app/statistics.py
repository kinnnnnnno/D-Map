"""同意済みの集計だけを返す。少数セルがあれば補完推測を避け全内訳を抑制。"""
from collections import Counter
from datetime import date, datetime, timedelta, timezone
from flask import Blueprint, jsonify
from .extensions import db
from .models import User, Attendance
from .security import visible_event

statistics=Blueprint('statistics',__name__,url_prefix='/api')
HIDDEN={'available':False,'message':'同意済み対象者が十分でないか、少数の属性が含まれるため非表示です。'}


def age_on(birth:date,at:date):
    return at.year-birth.year-((at.month,at.day)<(birth.month,birth.day))


def age_band(age):
    if age<0:return None
    if age<10:return '10歳未満'
    if age<20:return '10代'
    if age<30:return '20代'
    if age<40:return '30代'
    return '40代以上'


def aggregate(counter):
    total=sum(counter.values())
    if total<5 or any(count<5 for count in counter.values()):
        return dict(HIDDEN)
    return dict(available=True,targetCount=total,items=[dict(label=label,count=count,percentage=round(count/total*100,1)) for label,count in counter.items()])


def calculate(rows,at:date):
    ages=[];bands=Counter();genres=Counter();approximate=False
    for row in rows:
        if row.age_consent:
            band=None
            if row.birth_date:
                age=age_on(date.fromisoformat(row.birth_date),at)
                band=age_band(age)
                if band:ages.append(age)
            elif row.birth_year is not None:
                # 生年だけなら、誕生日の前後で同じ年代になる場合にだけ分類。
                before=age_band(at.year-row.birth_year-1)
                after=age_band(at.year-row.birth_year)
                if before is not None and before==after:
                    band=before
                    approximate=True
            if band:bands[band]+=1
        if row.genre_consent and row.main_genre:
            genres[row.main_genre]+=1
    age=aggregate(bands)
    if age['available']:
        age['averageAge']=None if approximate else round(sum(ages)/len(ages),1)
        age['averageNote']='生年のみを含むため平均年齢は非表示です。' if approximate else '開催日の日本時間時点。誕生日の月日を比較して算出。'
    genre=aggregate(genres)
    genre['method']='同意済みのメインジャンルのみ・1人1回答（サブジャンルは集計しません）'
    return dict(age=age,genre=genre)


@statistics.get('/events/<event_id>/statistics')
def event_statistics(event_id):
    event=visible_event(event_id)
    rows=db.session.execute(db.select(User.birth_date,User.birth_year,User.age_consent,User.main_genre,User.genre_consent).join(Attendance,Attendance.user_id==User.id).where(Attendance.event_id==event.id)).all()
    at=datetime.fromisoformat(event.start_at).astimezone(timezone(timedelta(hours=9))).date()
    return jsonify(calculate(rows,at))
