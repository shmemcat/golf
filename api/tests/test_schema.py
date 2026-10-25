from sqlalchemy import text
from golf_server.extensions import db
from golf_server.schema import REVISION, schema_ready, upgrade_schema


def test_readiness_requires_the_adopted_revision_and_owned_columns(app):
    with app.app_context():
        upgrade_schema()
        assert schema_ready()
        db.session.execute(text("UPDATE golf_schema_version SET version_num='golf_999'"))
        db.session.commit()
        assert not schema_ready()
        db.session.execute(text("UPDATE golf_schema_version SET version_num=:revision"), {"revision": REVISION})
        db.session.execute(text("ALTER TABLE golf_results DROP COLUMN detail"))
        db.session.commit()
        assert not schema_ready()


def test_upgrade_from_first_revision_preserves_results_and_adds_settings_table(app):
    from golf_server.models import Result
    from datetime import datetime
    with app.app_context():
        db.session.add(Result(game_id="old-game", user_id=1, mode="bot", status="completed",
                              started_at=datetime(2026, 6, 10), score=-9, detail={"holes": [-1] * 9}))
        db.session.execute(text("DROP TABLE golf_achievement_unlocks"))
        db.session.execute(text("UPDATE golf_schema_version SET version_num='golf_001'"))
        db.session.commit()
        assert not schema_ready()
        upgrade_schema()
        upgrade_schema()
        assert schema_ready()
        assert db.session.get(Result, ("old-game", 1)).score == -9
        assert "golf_achievement_unlocks" in db.inspect(db.engine).get_table_names()
