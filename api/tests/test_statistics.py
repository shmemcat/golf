"""Only completed games contribute to account game statistics."""

from datetime import datetime, timedelta

import pytest

from golf_server.extensions import db
from golf_server.models import Result
from golf_server.statistics import summarize


def result(game_id, status="completed", won=False, mode="bot", day=0, score=10):
    started = datetime(2026, 10, 1) + timedelta(days=day)
    return Result(game_id=game_id, user_id=1, mode=mode, status=status,
                  won=won, score=score, started_at=started,
                  completed_at=None if status == "active" else started + timedelta(hours=1),
                  detail={"holes": [score], "shared_win": won})


@pytest.mark.parametrize("status", ["active", "abandoned", "cancelled"])
def test_unfinished_games_do_not_count_as_played_won_or_lost(status):
    stats = summarize([result("unfinished", status=status)])
    assert stats["games_started"] == 1
    assert stats["games_abandoned"] == int(status == "abandoned")
    for key in ("games_played", "games_completed", "games_won", "games_lost",
                "win_rate", "current_win_streak", "best_win_streak", "shared_wins"):
        assert stats[key] == 0
    assert stats["best_score"] is stats["worst_score"] is stats["average_score"] is None
    assert not stats["achievements"]["first_game"]


def test_only_completed_losses_break_streaks_and_affect_win_rate():
    rows = [result("loss", day=0, score=30), result("win-1", won=True, day=1, score=5),
            result("abandoned", status="abandoned", day=2, score=100),
            result("win-2", won=True, day=3, score=-5),
            result("cancelled", status="cancelled", day=4),
            result("active", status="active", day=5),
            result("later-abandonment", status="abandoned", day=6)]
    stats = summarize(list(reversed(rows)))
    assert stats["games_played"] == stats["games_completed"] == 3
    assert stats["games_won"] == stats["shared_wins"] == 2
    assert stats["games_lost"] == 1
    assert stats["win_rate"] == 66.7
    assert stats["current_win_streak"] == stats["best_win_streak"] == 2
    assert (stats["best_score"], stats["worst_score"], stats["average_score"]) == (-5, 30, 10)
    assert stats["games_abandoned"] == 2
    # Completed holes and their achievements still belong to the player.
    assert stats["negative_holes"] == 1
    assert stats["worst_hole"] == 100


def test_saved_results_are_recalculated_for_all_time_and_both_modes(app, clients):
    with app.app_context():
        for mode in ("bot", "multiplayer"):
            db.session.add_all([
                result(f"{mode}-win", mode=mode, won=True),
                result(f"{mode}-loss", mode=mode),
                result(f"{mode}-abandoned", mode=mode, status="abandoned"),
                result(f"{mode}-cancelled", mode=mode, status="cancelled"),
                result(f"{mode}-active", mode=mode, status="active"),
            ])
        db.session.commit()
    response = clients(1).get("/api/golf/stats")
    assert response.status_code == 200
    for category, count in (("all_time", 4), ("bot", 2), ("multiplayer", 2)):
        stats = response.json["statistics"][category]
        assert stats["games_played"] == stats["games_completed"] == count
        assert stats["games_won"] == stats["games_lost"] == stats["games_abandoned"] == count // 2
        assert stats["win_rate"] == 50
    with app.app_context():
        assert Result.query.count() == 10
