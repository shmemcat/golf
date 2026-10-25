from datetime import datetime
from .extensions import db


class Room(db.Model):
    __tablename__ = "golf_rooms"
    code = db.Column(db.String(8), primary_key=True)
    data = db.Column(db.JSON, nullable=False)
    updated_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)


class Result(db.Model):
    __tablename__ = "golf_results"
    game_id = db.Column(db.String(40), primary_key=True)
    user_id = db.Column(db.BigInteger, primary_key=True, index=True)
    mode = db.Column(db.String(16), nullable=False, index=True)
    status = db.Column(db.String(16), nullable=False, default="active")
    started_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    completed_at = db.Column(db.DateTime, index=True)
    won = db.Column(db.Boolean, nullable=False, default=False)
    score = db.Column(db.Integer, nullable=False, default=0)
    detail = db.Column(db.JSON, nullable=False, default=dict)


class Event(db.Model):
    __tablename__ = "golf_events"
    id = db.Column(db.Integer, primary_key=True)
    game_id = db.Column(db.String(40), nullable=False, index=True)
    revision = db.Column(db.Integer, nullable=False)
    seat = db.Column(db.Integer)
    kind = db.Column(db.String(24), nullable=False)
    detail = db.Column(db.JSON, nullable=False, default=dict)
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    __table_args__ = (db.UniqueConstraint("game_id", "revision", name="golf_event_revision"),)


class DeletedUser(db.Model):
    __tablename__ = "golf_deleted_users"
    user_id = db.Column(db.BigInteger, primary_key=True)
    request_id = db.Column(db.String(64), nullable=False)
