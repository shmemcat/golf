from .extensions import db

REVISION = "golf_001"


def upgrade_schema():
    # Only Golf-owned tables are present in this application's metadata.
    from . import models  # noqa: F401
    db.create_all()
    from sqlalchemy import text
    with db.engine.begin() as connection:
        connection.execute(text("CREATE TABLE IF NOT EXISTS golf_schema_version (version_num VARCHAR(32) PRIMARY KEY)"))
        current = connection.execute(text("SELECT version_num FROM golf_schema_version")).scalar()
        if current is None:
            connection.execute(text("INSERT INTO golf_schema_version VALUES (:revision)"), {"revision": REVISION})
        elif current != REVISION:
            raise RuntimeError("An explicit Golf schema migration is required.")


def schema_ready():
    from sqlalchemy import inspect, text
    from sqlalchemy.exc import SQLAlchemyError
    from . import models
    try:
        inspector = inspect(db.engine)
        required = {"golf_rooms", "golf_results", "golf_events", "golf_deleted_users", "golf_schema_version"}
        if not required <= set(inspector.get_table_names()):
            return False
        for table in db.metadata.sorted_tables:
            if not set(table.columns.keys()) <= {c["name"] for c in inspector.get_columns(table.name)}:
                return False
        return db.session.execute(text("SELECT version_num FROM golf_schema_version")).scalar() == REVISION
    except SQLAlchemyError:
        db.session.rollback()
        return False


if __name__ == "__main__":
    import sys
    from .application import create_app
    app = create_app({"START_GOLF_WORKER": False})
    with app.app_context():
        if sys.argv[1:] == ["upgrade"]:
            upgrade_schema()
        elif sys.argv[1:] == ["check"]:
            raise SystemExit(0 if schema_ready() else 1)
        else:
            raise SystemExit("Use upgrade or check")
