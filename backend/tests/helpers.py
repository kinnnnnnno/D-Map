def send(client,path,data=None,method='post',**kwargs):
    token=client.get('/api/auth/session').get_json()['csrfToken']
    return getattr(client,method)(path,json=data,headers={'X-CSRFToken':token},**kwargs)


def register(client,index=1,**profile):
    return send(client,'/api/auth/register',dict(email=f'demo{index}@example.invalid',password='test-password-123',dancerName=f'架空ダンサー{index}',**profile))


def login(client,index=1):
    return send(client,'/api/auth/login',dict(email=f'demo{index}@example.invalid',password='test-password-123'))


def event_payload(**patch):
    return dict(title='テスト専用の架空イベント',type='練習会',genre='BREAKING',
                startAt='2030-05-01T22:00:00+09:00',endAt='2030-05-02T02:00:00+09:00',
                prefecture='東京都',venueName='架空スタジオ',address='東京都新宿区（架空の会場）',
                latitude=35.69,longitude=139.7,feeYen=500,organizerName='架空主催',
                participationRule='テスト用',description='実在しない検証用イベント',visibility='public') | patch
