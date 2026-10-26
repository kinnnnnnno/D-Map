from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
import multiprocessing
import pytest
from app.extensions import db
from app.models import Attendance, Event
from .helpers import register, send, event_payload


def setup_event(client,capacity=2):
    assert register(client).status_code==201
    response=send(client,'/api/events',event_payload(capacity=capacity))
    assert response.status_code==201
    return response.get_json()['id']


def test_attend_duplicate_cancel_capacity(app,client):
    event_id=setup_event(client,1)
    path=f'/api/events/{event_id}/participation'
    assert send(client,path,{}).status_code==201
    assert send(client,path,{}).status_code==409
    other=app.test_client();register(other,2)
    assert send(other,path,{}).status_code==409
    assert client.get(f'/api/events/{event_id}').get_json()['remainingSlots']==0
    assert send(client,path,method='delete').get_json()['attendanceCount']==0
    assert send(other,path,{}).status_code==201
    assert send(client,path,{'userId':2},method='delete').status_code==400
    assert client.get(f'/api/events/{event_id}').get_json()['attendanceCount']==1


def test_no_auth_and_cancelled(app,client):
    event_id=setup_event(client)
    path=f'/api/events/{event_id}/participation'
    anon=app.test_client()
    assert send(anon,path,{}).status_code==401
    with app.app_context():
        db.session.get(Event,event_id).status='cancelled';db.session.commit()
    assert send(client,path,{}).status_code==409


def test_group_access_and_unlimited(app,client):
    register(client)
    group=send(client,'/api/groups',{'name':'架空チーム'}).get_json()['id']
    event_id=send(client,'/api/events',event_payload(visibility='group',groupId=group)).get_json()['id']
    other=app.test_client();register(other,2)
    assert send(other,f'/api/events/{event_id}/participation',{}).status_code==404
    row=send(client,f'/api/events/{event_id}/participation',{}).get_json()
    assert row['capacity'] is None and row['remainingSlots'] is None and row['attendanceCount']==1


@pytest.mark.parametrize('capacity',[1,2])
def test_simultaneous_connections_never_overbook(app,client,capacity):
    event_id=setup_event(client,capacity)
    clients=[client]+[app.test_client() for _ in range(4)]
    for index,other in enumerate(clients[1:],2):
        assert register(other,index).status_code==201
    barrier=Barrier(len(clients))
    def join(other):
        token=other.get('/api/auth/session').get_json()['csrfToken']
        barrier.wait(timeout=20)
        return other.post(f'/api/events/{event_id}/participation',json={},headers={'X-CSRFToken':token}).status_code
    with ThreadPoolExecutor(max_workers=5) as pool:
        results=list(pool.map(join,clients))
    assert results.count(201)==capacity
    assert results.count(409)==len(clients)-capacity
    with app.app_context():
        assert db.session.scalar(db.select(db.func.count()).select_from(Attendance).where(Attendance.event_id==event_id))==capacity


def _process_join(uri,key,cookie,event_id,barrier,queue):
    from app import create_app
    app=create_app({'TESTING':True,'SECRET_KEY':key,'SQLALCHEMY_DATABASE_URI':uri})
    client=app.test_client();client.set_cookie('dmap_session',cookie)
    token=client.get('/api/auth/session').get_json()['csrfToken']
    barrier.wait(timeout=30)
    response=client.post(f'/api/events/{event_id}/participation',json={},headers={'X-CSRFToken':token})
    queue.put(response.status_code)
    with app.app_context():
        db.session.remove();db.engine.dispose()


def test_simultaneous_separate_processes(app,client):
    event_id=setup_event(client,1)
    other=app.test_client();register(other,2)
    context=multiprocessing.get_context('spawn')
    barrier=context.Barrier(2);queue=context.Queue()
    processes=[context.Process(target=_process_join,args=(app.config['SQLALCHEMY_DATABASE_URI'],app.config['SECRET_KEY'],c.get_cookie('dmap_session').value,event_id,barrier,queue)) for c in [client,other]]
    for process in processes:process.start()
    for process in processes:
        process.join(timeout=60)
        if process.is_alive():
            process.terminate();process.join()
            pytest.fail('同時登録プロセスが時間内に終了しませんでした。')
        assert process.exitcode==0
    assert sorted([queue.get(timeout=5),queue.get(timeout=5)])==[201,409]
    queue.close()


def test_cannot_reduce_capacity_below_count(app,client):
    event_id=setup_event(client,2)
    send(client,f'/api/events/{event_id}/participation',{})
    other=app.test_client();register(other,2)
    send(other,f'/api/events/{event_id}/participation',{})
    assert send(client,f'/api/events/{event_id}',event_payload(capacity=1),method='put').status_code==409
    assert send(client,f'/api/events/{event_id}',event_payload(capacity=0),method='put').status_code==400
    assert send(client,f'/api/events/{event_id}',event_payload(capacity=None),method='put').status_code==200


def test_database_unique_constraint(app,client):
    from sqlalchemy.exc import IntegrityError
    event_id=setup_event(client)
    send(client,f'/api/events/{event_id}/participation',{})
    with app.app_context():
        db.session.add(Attendance(event_id=event_id,user_id=1))
        with pytest.raises(IntegrityError):
            db.session.commit()
        db.session.rollback()
