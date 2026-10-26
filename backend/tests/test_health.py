import pytest

from app import create_app


@pytest.fixture
def client():
    app = create_app()
    app.config["TESTING"] = True
    with app.test_client() as test_client:
        yield test_client


def test_health_returns_ok_json(client):
    response = client.get("/api/health")

    assert response.status_code == 200
    assert response.mimetype == "application/json"
    assert response.get_json() == {"status": "ok"}


def test_health_rejects_post(client):
    response = client.post("/api/health")

    assert response.status_code == 405
