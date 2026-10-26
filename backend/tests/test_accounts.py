from datetime import datetime, timedelta, timezone
import pytest
from app.extensions import db
from app.models import User, Invitation
from .helpers import send,register,login,event_payload


def test_registration_login_logout_and_cookie(app,client):
    response=register(client,birthDate='2000-01-01',ageStatsConsent=True)
    assert response.status_code==201
    assert 'HttpOnly' in response.headers.get('Set-Cookie','')
    assert 'SameSite=Lax' in response.headers.get('Set-Cookie','')
    old=client.get_cookie('dmap_session').value
    assert client.get('/api/profile').get_json()['birthDate']=='2000-01-01'
    with app.app_context():
        assert db.session.get(User,1).password_hash.startswith('scrypt:')
        assert 'test-password-123' not in db.session.get(User,1).password_hash
    assert send(client,'/api/auth/logout').status_code==200
    assert client.get('/api/profile').status_code==401
    stolen=app.test_client()
    stolen.set_cookie('dmap_session',old)
    assert stolen.get('/api/profile').status_code==401
    assert login(client).status_code==200


@pytest.mark.parametrize('patch',[{'email':'bad'}, {'password':'short'}, {'dancerName':''}, {'birthDate':'2026-02-30'}, {'birthYear':True}, {'ageStatsConsent':'yes'}, {'mainGenre':'all'}, {'subGenres':['unknown']}])
def test_bad_registration(client,patch):
    data=dict(email='demo@example.invalid',password='test-password-123',dancerName='架空ダンサー')
    data.update(patch)
    assert send(client,'/api/auth/register',data).status_code==400


def test_csrf_login_failure_duplicate_and_profile(client):
    assert client.post('/api/auth/register',json={}).status_code==400
    assert register(client).status_code==201
    data=client.get('/api/profile').get_json()
    data.update(dancerName='変更名',birthYear=2000,ageStatsConsent=True)
    assert send(client,'/api/profile',data,method='put').get_json()['dancerName']=='変更名'
    data['ageStatsConsent']=False
    assert send(client,'/api/profile',data,method='put').get_json()['ageStatsConsent'] is False
    send(client,'/api/auth/logout')
    assert send(client,'/api/auth/login',dict(email='demo1@example.invalid',password='incorrect-password')).status_code==401
    assert register(client).status_code==409


def test_group_permissions_and_no_leaks(app,client):
    register(client)
    gid=send(client,'/api/groups',{'name':'架空チーム'}).get_json()['id']
    payload=event_payload()
    payload.update(visibility='group',groupId=gid,title='秘密の予定')
    event_id=send(client,'/api/events',payload).get_json()['id']
    invite=send(client,f'/api/groups/{gid}/invitations').get_json()
    outsider=app.test_client()
    assert outsider.get(f'/api/events/{event_id}').status_code==404
    assert all(row['id']!=event_id for row in outsider.get('/api/events').get_json())
    register(outsider,2)
    assert outsider.get(f'/api/groups/{gid}/members').status_code==404
    assert outsider.get(f'/api/events/{event_id}').status_code==404
    assert send(outsider,'/api/groups/join',{'code':invite['code']}).status_code==200
    assert outsider.get(f'/api/events/{event_id}').get_json()['title']=='秘密の予定'
    assert any(row['id']==event_id for row in outsider.get('/api/events').get_json())
    assert send(outsider,'/api/events',payload).status_code==403
    assert send(outsider,f'/api/events/{event_id}',payload,method='put').status_code==403
    assert send(outsider,f'/api/groups/{gid}/invitations').status_code==403
    members=outsider.get(f'/api/groups/{gid}/members').get_json()
    assert all(set(row)=={'id','dancerName','role'} for row in members)
    assert send(client,f'/api/events/{event_id}',payload,method='put').status_code==200


def test_invitation_expiry_revocation_and_hash(app,client):
    register(client)
    gid=send(client,'/api/groups',{'name':'架空'}).get_json()['id']
    invitation=send(client,f'/api/groups/{gid}/invitations').get_json()
    with app.app_context():
        row=db.session.get(Invitation,invitation['id'])
        assert row.token_hash!=invitation['code']
        row.expires_at=(datetime.now(timezone.utc)-timedelta(seconds=1)).isoformat()
        db.session.commit()
    outsider=app.test_client();register(outsider,2)
    assert send(outsider,'/api/groups/join',{'code':invitation['code']}).status_code==400
    invitation=send(client,f'/api/groups/{gid}/invitations').get_json()
    assert send(client,f'/api/groups/{gid}/invitations/{invitation["id"]}',method='delete').status_code==200
    assert send(outsider,'/api/groups/join',{'code':invitation['code']}).status_code==400
    assert 'token_hash' not in client.get(f'/api/groups/{gid}/invitations').get_data(as_text=True)


def test_public_event_ownership_and_validation(app,client):
    register(client)
    payload=event_payload()
    created=send(client,'/api/events',payload)
    assert created.status_code==201
    row=created.get_json()
    assert row['startAt']=='2030-05-01T13:00:00+00:00'
    other=app.test_client();register(other,2)
    assert send(other,f'/api/events/{row["id"]}',payload,method='put').status_code==403
    assert send(other,f'/api/events/{row["id"]}',method='delete').status_code==403
    payload['endAt']=payload['startAt']
    assert send(client,'/api/events',payload).status_code==400
    assert send(client,f'/api/events/{row["id"]}',method='delete').status_code==204
    assert client.get(f'/api/events/{row["id"]}').status_code==404


def test_origin_and_json_validation(client):
    token=client.get('/api/auth/session').get_json()['csrfToken']
    assert client.post('/api/auth/register',json={},headers={'X-CSRFToken':token,'Origin':'https://other.invalid'}).status_code==403
    assert send(client,'/api/auth/register',[]).status_code==400
