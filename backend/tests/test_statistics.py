from datetime import date
from types import SimpleNamespace
import pytest
from app.extensions import db
from app.models import User, Attendance
from app.statistics import calculate, age_on
from .helpers import register,send,event_payload


def person(**patch):
    return SimpleNamespace(**(dict(birth_date='2000-05-02',birth_year=None,age_consent=True,main_genre='BREAKING',genre_consent=True)|patch))


@pytest.mark.parametrize('count',range(5))
def test_under_five_has_no_raw_data(count):
    result=calculate([person() for _ in range(count)],date(2030,5,1))
    for value in result.values():
        assert value['available'] is False
        assert not {'items','targetCount','averageAge','birthDate','birthYear'} & set(value)


def test_exact_age_and_genre_denominator():
    result=calculate([person() for _ in range(5)],date(2030,5,1))
    assert result['age']['targetCount']==5
    assert result['age']['averageAge']==29
    assert result['age']['items']==[dict(label='20代',count=5,percentage=100.0)]
    assert result['genre']['items']==[dict(label='BREAKING',count=5,percentage=100.0)]


def test_sparse_cells_hide_entire_breakdown():
    rows=[person() for _ in range(5)]+[person(birth_date='1990-01-01',main_genre='POP')]
    result=calculate(rows,date(2030,5,1))
    assert result['age']['available'] is False
    assert result['genre']['available'] is False
    assert 'items' not in result['age'] and 'targetCount' not in result['age']


def test_birth_year_never_guesses_average_or_boundary():
    result=calculate([person(birth_date=None,birth_year=2005) for _ in range(5)],date(2030,5,1))
    assert result['age']['available'] and result['age']['averageAge'] is None
    assert result['age']['items'][0]['label']=='20代'
    assert calculate([person(birth_date=None,birth_year=2000) for _ in range(5)],date(2030,5,1))['age']['available'] is False


def test_no_consent_and_birthday_rule():
    result=calculate([person(age_consent=False,genre_consent=False) for _ in range(10)],date(2030,5,1))
    assert not result['age']['available'] and not result['genre']['available']
    assert age_on(date(2000,2,29),date(2029,2,28))==28
    assert age_on(date(2000,2,29),date(2029,3,1))==29


def test_api_revocation_and_private_event(app,client):
    register(client)
    event_id=send(client,'/api/events',event_payload()).get_json()['id']
    with app.app_context():
        for index in range(5):
            user=User(email=f'stats{index}@example.invalid',password_hash='test-only-unused',dancer_name=f'架空{index}',birth_date='2000-05-02',age_consent=True,main_genre='BREAKING',genre_consent=True)
            db.session.add(user);db.session.flush()
            db.session.add(Attendance(event_id=event_id,user_id=user.id))
        db.session.commit()
    path=f'/api/events/{event_id}/statistics'
    data=client.get(path).get_json()
    assert data['age']['targetCount']==5
    assert '2000-05-02' not in str(data) and 'example.invalid' not in str(data)
    with app.app_context():
        user=db.session.scalar(db.select(User).where(User.email=='stats0@example.invalid'))
        user.age_consent=False;user.genre_consent=False;db.session.commit()
    data=client.get(path).get_json()
    assert not data['age']['available'] and 'targetCount' not in data['age']
    group_id=send(client,'/api/groups',{'name':'限定統計'}).get_json()['id']
    private_id=send(client,'/api/events',event_payload(visibility='group',groupId=group_id)).get_json()['id']
    assert app.test_client().get(f'/api/events/{private_id}/statistics').status_code==404
