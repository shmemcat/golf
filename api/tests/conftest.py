import pytest
from flask import request
from golf_server.application import create_app, TIMINGS
from golf_server.account_contracts import AccountIdentity
from golf_server.extensions import db
from golf_server.schema import upgrade_schema


class Accounts:
    def __init__(self):
        self.deleted = set()
        self.revoked = set()

    def refresh(self):
        pass

    def cookie_user(self):
        value = request.cookies.get('test_account')
        uid = int(value) if value else None
        return self.identity(uid) if uid and uid not in self.revoked else None

    def identity(self, uid):
        return AccountIdentity(uid, f'Player {uid}', 'user', True)

    def public_profiles(self, ids):
        return {uid: self.identity(uid) for uid in ids if uid not in self.deleted}


@pytest.fixture
def app(tmp_path):
    value = create_app({
        'TESTING': True, 'SECRET_KEY': 'test-golf-secret-' * 4,
        'SQLALCHEMY_DATABASE_URI': 'sqlite:///' + (tmp_path / 'golf.sqlite').as_posix(),
        'START_GOLF_WORKER': False, 'GOLF_TIMINGS': {key: 0 for key in TIMINGS},
        'GAME_ACCOUNT_TOKENS': {'golf': 'deletion-token-' * 4},
    }, accounts=Accounts())
    with value.app_context():
        upgrade_schema()
    yield value
    with value.app_context():
        db.session.remove()
        db.engine.dispose()


@pytest.fixture
def clients(app):
    def build(uid=None):
        client = app.test_client()
        if uid:
            client.set_cookie('test_account', str(uid))
        token = client.get('/api/golf/session').json['csrf_token']
        client.golf_headers = {'Origin': 'http://localhost:3003', 'X-Golf-CSRF': token}
        client.golf_token = token
        return client
    return build
