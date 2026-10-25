from sqlalchemy import text
from golf_server.extensions import db
from golf_server.schema import schema_ready, upgrade_schema


def test_readiness_requires_the_adopted_revision_and_owned_columns(app):
    with app.app_context():
        upgrade_schema()
        assert schema_ready()
        db.session.execute(text("UPDATE golf_schema_version SET version_num='golf_999'"))
        db.session.commit()
        assert not schema_ready()
        db.session.execute(text("UPDATE golf_schema_version SET version_num='golf_001'"))
        db.session.execute(text("ALTER TABLE golf_results DROP COLUMN detail"))
        db.session.commit()
        assert not schema_ready()
