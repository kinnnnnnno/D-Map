from datetime import datetime, timezone, date, timedelta
import math
import re
from flask import request, abort
GENRES = ['HIP HOP','HOUSE','BREAKING','LOCK','POP','WAACK','ALL STYLE','KRUMP','JAZZ','VOGUE','FREESTYLE']
PREFECTURES = '北海道 青森県 岩手県 宮城県 秋田県 山形県 福島県 茨城県 栃木県 群馬県 埼玉県 千葉県 東京都 神奈川県 新潟県 富山県 石川県 福井県 山梨県 長野県 岐阜県 静岡県 愛知県 三重県 滋賀県 京都府 大阪府 兵庫県 奈良県 和歌山県 鳥取県 島根県 岡山県 広島県 山口県 徳島県 香川県 愛媛県 高知県 福岡県 佐賀県 長崎県 熊本県 大分県 宮崎県 鹿児島県 沖縄県'.split()


def body():
    data = request.get_json(silent=True)
    if not isinstance(data,dict):
        abort(400, description='JSONオブジェクトを送信してください。')
    return data


def text(data,key,limit,required=True):
    value = data.get(key,'')
    if not isinstance(value,str) or len(value.strip()) > limit or (required and not value.strip()):
        abort(400, description=f'{key}を正しく入力してください。')
    return value.strip()


def boolean(data,key):
    value = data.get(key,False)
    if type(value) is not bool:
        abort(400, description=f'{key}は真偽値で指定してください。')
    return value


def profile(data):
    name = text(data,'dancerName',60)
    main = data.get('mainGenre') or None
    subs = data.get('subGenres',[])
    region = data.get('activityRegion') or None
    if main is not None and main not in GENRES:
        abort(400, description='メインジャンルが不正です。')
    if not isinstance(subs,list) or len(subs)>len(GENRES) or any(not isinstance(g,str) or g not in GENRES for g in subs):
        abort(400, description='サブジャンルが不正です。')
    if region is not None and region not in PREFECTURES:
        abort(400, description='活動地域が不正です。')
    birth = data.get('birthDate') or None
    year = data.get('birthYear')
    if birth and year is not None:
        abort(400, description='生年月日と生年はどちらか一方を指定してください。')
    today = datetime.now(timezone(timedelta(hours=9))).date()
    if birth:
        try:
            parsed = date.fromisoformat(birth)
            if parsed.isoformat()!=birth or parsed>today or today.year-parsed.year>120:
                raise ValueError()
        except (ValueError,TypeError):
            abort(400, description='生年月日が不正です。')
    if year is not None and (type(year) is not int or not today.year-120<=year<=today.year):
        abort(400, description='生年が不正です。')
    return dict(dancer_name=name,main_genre=main,sub_genres=list(dict.fromkeys(subs)),activity_region=region,
                birth_date=birth,birth_year=year,age_consent=boolean(data,'ageStatsConsent'),genre_consent=boolean(data,'genreStatsConsent'))


def credentials(data):
    email = text(data,'email',254).lower()
    password = data.get('password')
    if not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+',email) or not isinstance(password,str) or not 12<=len(password)<=128:
        abort(400, description='メールと12〜128文字のパスワードを確認してください。')
    return email,password


def event_fields(data):
    fields = {key:text(data,key,limit) for key,limit in [('title',120),('venueName',120),('address',250),('organizerName',80),('participationRule',500),('description',5000)]}
    for key,options in [('genre',GENRES),('type',['練習会','セッション','ワークショップ','バトル']),('prefecture',PREFECTURES),('visibility',['public','group']),('status',['scheduled','cancelled'])]:
        value=data.get(key,'scheduled' if key=='status' else None)
        if value not in options:
            abort(400, description=f'{key}が不正です。')
        fields[key]=value
    for key in ['startAt','endAt']:
        try:
            value=datetime.fromisoformat(data[key])
            if value.tzinfo is None:
                raise ValueError()
            fields[key]=value.astimezone(timezone.utc).isoformat()
        except (ValueError,TypeError,KeyError):
            abort(400, description='時刻はタイムゾーン付きISO形式で指定してください。')
    if fields['endAt']<=fields['startAt']:
        abort(400, description='終了は開始より後にしてください。')
    for key,low,high in [('latitude',-90,90),('longitude',-180,180),('feeYen',0,1000000)]:
        value=data.get(key)
        if type(value) not in (int,float) or not math.isfinite(value) or not low<=value<=high or (key=='feeYen' and type(value) is not int):
            abort(400, description=f'{key}が不正です。')
        fields[key]=value
    group_id=data.get('groupId')
    if fields['visibility']=='group' and (type(group_id) is not int or group_id<=0):
        abort(400, description='グループを指定してください。')
    fields['groupId']=group_id if fields['visibility']=='group' else None
    capacity=data.get('capacity')
    if capacity is not None and (type(capacity) is not int or not 1<=capacity<=1000000):
        abort(400,description='定員は正の整数、または未指定にしてください。')
    fields['capacity']=capacity
    fields['walk_ins']=boolean(data,'walkIns')
    mapping={'startAt':'start_at','endAt':'end_at','venueName':'venue_name','organizerName':'organizer_name','participationRule':'participation_rule','feeYen':'fee_yen','groupId':'group_id'}
    return {mapping.get(key,key):value for key,value in fields.items()}
