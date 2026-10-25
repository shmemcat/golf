from .extensions import db


def upgrade_schema():
    # Only Golf-owned tables are present in this application's metadata.
    from . import models  # noqa: F401
    db.create_all()


def schema_ready():
    from sqlalchemy import inspect
    return {"golf_rooms", "golf_results", "golf_events", "golf_deleted_users"} <= set(inspect(db.engine).get_table_names())
