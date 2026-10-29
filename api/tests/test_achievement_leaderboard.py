from datetime import datetime

import pytest

from golf_server.extensions import db
from golf_server.models import AchievementUnlock, DeletedUser, Result
from golf_server.statistics import achievement_count


@pytest.mark.parametrize("games, expected", [(9, 0), (10, 1), (50, 2), (100, 3)])
def test_each_game_tier_counts(games, expected):
    assert achievement_count({"games_completed": games, "achievements": {"first_game": True, "geezer": False}}) == expected + 1


def test_combines_modes_limits_to_ten_and_filters_deleted_missing_accounts(app):
    with app.app_context():
        for uid in range(1, 16):
            db.session.add(AchievementUnlock(user_id=uid, achievement_id="geezer"))
        db.session.add(DeletedUser(user_id=1, request_id="deleted"))
        for i in range(10):
            db.session.add(Result(game_id=str(i), user_id=14, mode="bot" if i % 2 else "multiplayer",
                                  status="completed", won=False, score=5, started_at=datetime(2026, 10, 1, 12),
                                  completed_at=datetime(2026, 10, 1, 13), detail={"holes": [5]}))
        db.session.commit()
    app.extensions["accounts"].deleted.add(2)
    response = app.test_client().get("/api/golf/leaderboard?mode=achievements")
    assert response.status_code == 200
    assert response.json["monthly"] == []
    rows = response.json["all_time"]
    assert len(rows) == 10
    assert rows[0] == dict(rank=1, username="Player 14", profile_icon="user", achievement_count=3)
    assert [row["rank"] for row in rows] == list(range(1, 11))
    assert not {"Player 1", "Player 2"} & {row["username"] for row in rows}
