import copy
import time
import uuid
from datetime import datetime, timedelta, timezone

import pytest

from golf_server import engine
from golf_server.extensions import db
from golf_server.models import AchievementUnlock, Result, Room
from golf_server.statistics import count_hole, save_results, summarize


def result(holes=(), score=0, won=False, status="completed", started=None, mode="bot", **detail):
    started = started or datetime(2026, 6, 10, 12)
    return Result(game_id=str(uuid.uuid4()), user_id=1, mode=mode, status=status,
                  started_at=started, completed_at=started + timedelta(hours=1),
                  score=score, won=won, detail={"holes": list(holes), **detail})


@pytest.mark.parametrize("holes, birdie, eagle, recovery", [
    ([0, 1, -1], True, False, True),
    ([1, -2], False, True, True),
    ([1, 0, -2], False, True, False),
    ([-2, 1], False, True, False),
    ([-3], False, False, False),
    ([], False, False, False),
])
def test_exact_hole_scores_and_consecutive_recovery(holes, birdie, eagle, recovery):
    badges = summarize([result(holes)])["achievements"]
    assert (badges["birdie"], badges["eagle"], badges["up_and_down"]) == (birdie, eagle, recovery)


def test_recovery_cannot_cross_games_and_active_games_do_not_unlock():
    rows = [result([2]), result([-1]), result([-2], status="active", hole_in_one=True)]
    badges = summarize(rows)["achievements"]
    assert badges["birdie"] and badges["negative_hole"]
    assert not badges["up_and_down"] and not badges["eagle"] and not badges["hole_in_one"]


@pytest.mark.parametrize("score, scores, won, photo, sunday", [
    (-18, [-18, -17], True, True, True),
    (-19, [-19, -18, 0], True, True, True),
    (-17, [-17, 2], True, False, False),
    (-18, [-18, -18, -17], True, False, True),
    (-18, [-19, -18], False, False, True),
    (0, [], True, False, False),
])
def test_completed_game_awards(score, scores, won, photo, sunday):
    badges = summarize([result(score=score, scores=scores, won=won)])["achievements"]
    assert (badges["photo_finish"], badges["sunday_best"]) == (photo, sunday)
    abandoned = summarize([result(score=score, scores=scores, won=won, status="abandoned")])["achievements"]
    assert not abandoned["photo_finish"] and not abandoned["sunday_best"]


def test_matching_all_columns_is_remembered_and_requires_one_complete_hole():
    game = engine.deal(2)
    data = {"game": game, "metrics": [{}, {}]}
    for player, ranks in zip(game["players"], [("A", "2", "K", "A", "2", "K"), ("A", "2", "K", "A", "2", "Q")]):
        for cell, rank in zip(player["cards"], ranks):
            cell.update(card={"rank": rank}, faceUp=True)
    count_hole(data)
    assert data["metrics"][0]["hole_in_one"] is True
    assert not data["metrics"][1].get("hole_in_one", False)
    # Six pairs spread across several holes must not masquerade as three in one.
    count_hole(data)
    assert not data["metrics"][1].get("hole_in_one", False)
    game["players"][0]["cards"][0]["card"]["rank"] = "Q"
    count_hole(data)
    assert data["metrics"][0]["hole_in_one"] is True


@pytest.mark.parametrize("rank", engine.RANKS)
def test_six_of_a_kind_accepts_every_rank_and_keeps_existing_scoring(rank):
    game = engine.deal(2)
    data = {"game": game, "metrics": [{}, {}]}
    for index, cell in enumerate(game["players"][0]["cards"]):
        cell.update(card={"rank": rank, "suit": engine.SUITS[index % 4]}, faceUp=True)
    before = copy.deepcopy(game)
    count_hole(data)
    assert data["metrics"][0]["six_of_a_kind"] is True
    assert data["metrics"][0]["hole_in_one"] is True
    assert data["metrics"][0]["bonus_blocks"] == 1
    assert game == before
    assert engine.score_grid(game["players"][0]["cards"]) == (-32 if rank == "2" else -20)
    # A later hole must not erase the achievement.
    game["players"][0]["cards"][0]["card"]["rank"] = "Q" if rank != "Q" else "K"
    count_hole(data)
    assert data["metrics"][0]["six_of_a_kind"] is True


@pytest.mark.parametrize("ranks", [
    ("A", "2", "K", "A", "2", "K"),  # Three pairs with different ranks.
    ("9", "9", "A", "9", "9", "K"),  # A matching block.
    ("9", "9", "9", "9", "9", "K"),  # One card short.
    ("10", "J", "Q", "10", "J", "Q"),  # Equal values are not equal ranks.
])
def test_six_of_a_kind_cannot_accumulate_matches_across_holes(ranks):
    game = engine.deal(2)
    data = {"game": game, "metrics": [{}, {}]}
    for cell, rank in zip(game["players"][0]["cards"], ranks):
        cell.update(card={"rank": rank}, faceUp=True)
    for _ in range(3):
        count_hole(data)
    assert not data["metrics"][0].get("six_of_a_kind", False)


@pytest.mark.parametrize("ranks, expected, score", [
    (("2", "2", "K", "2", "2", "K"), True, -28),
    (("K", "2", "2", "K", "2", "2"), True, -28),
    (("2",) * 6, True, -32),
    (("2", "2", "2", "2", "2", "K"), True, -30),
    (("2", "2", "3", "2", "2", "A"), True, -24),
    (("9", "9", "2", "9", "9", "2"), False, None),
    (("2", "K", "2", "2", "K", "2"), False, None),
    (("2", "2", "K", "2", "A", "K"), False, None),
    (("A", "2", "K", "A", "2", "K"), False, None),
])
def test_deuce_almighty_requires_an_adjacent_block_of_twos_without_changing_scores(ranks, expected, score):
    game = engine.deal(2)
    data = {"game": game, "metrics": [{}, {}]}
    for index, (cell, rank) in enumerate(zip(game["players"][0]["cards"], ranks)):
        cell.update(card={"rank": rank, "suit": engine.SUITS[index % 4]}, faceUp=True)
    before = copy.deepcopy(game)
    for _ in range(3):
        count_hole(data)
        assert bool(data["metrics"][0].get("deuce_almighty")) == expected
    assert game == before
    if expected:
        assert engine.score_grid(game["players"][0]["cards"]) == score
        for cell in game["players"][0]["cards"]:
            cell["card"]["rank"] = "K"
        count_hole(data)
        assert data["metrics"][0]["deuce_almighty"]


@pytest.mark.parametrize("achievement, matching_ranks, expected_score", [
    ("six_of_a_kind", ("K",) * 6, -20),
    ("deuce_almighty", ("2", "2", "K", "2", "2", "K"), -28),
])
@pytest.mark.parametrize("status", ["completed", "abandoned", "cancelled"])
@pytest.mark.parametrize("mode", ["bot", "multiplayer"])
def test_board_achievement_survives_result_reload_and_is_scoped_to_player_and_mode(app, clients, status, mode, achievement, matching_ranks, expected_score):
    game = engine.deal(2)
    data = {"game": game, "mode": mode, "startedAt": time.time(), "humanCount": 2,
            "seats": [{"userId": 1}, {"userId": 2}], "metrics": [{}, {}]}
    for player, ranks in zip(game["players"], [matching_ranks, ("A", "2", "K", "A", "2", "K")]):
        for cell, rank in zip(player["cards"], ranks):
            cell["card"]["rank"] = rank
    with app.app_context():
        engine.finish_hole(game, went_out=None)
        app.extensions["golf_runtime"].next_turn(data)
        db.session.commit()
        assert db.session.get(Result, (game["id"], 1)).detail[achievement]
        assert not clients(1).get("/api/golf/stats").json["statistics"]["all_time"]["achievements"][achievement]
        save_results(data, terminal=status == "completed", abandoned=status == "abandoned", cancelled=status == "cancelled")
        db.session.commit()
        # Repeated terminal saves cannot rewrite a previously earned badge.
        data["metrics"][0][achievement] = False
        save_results(data, terminal=True)
        db.session.commit()
        db.session.remove()
    stats = clients(1).get("/api/golf/stats").json["statistics"]
    assert stats["all_time"]["achievements"][achievement]
    assert stats[mode]["achievements"][achievement]
    other_mode = "multiplayer" if mode == "bot" else "bot"
    assert not stats[other_mode]["achievements"][achievement]
    assert not clients(2).get("/api/golf/stats").json["statistics"]["all_time"]["achievements"][achievement]
    with app.app_context():
        stored = db.session.get(Result, (game["id"], 1))
        assert stored.score == expected_score
        assert stored.detail["holes"] == [expected_score]
        assert stored.status == status


@pytest.mark.parametrize("achievement", ["six_of_a_kind", "dont_quit_your_day_job"])
def test_operator_granted_achievement_needs_no_fake_results_and_is_deleted_with_account(app, clients, achievement):
    player, other = clients(1), clients(2)
    with app.app_context():
        db.session.add(AchievementUnlock(user_id=1, achievement_id=achievement))
        db.session.commit()
        db.session.remove()
    for stats in player.get("/api/golf/stats").json["statistics"].values():
        assert stats["achievements"][achievement]
        assert stats["games_started"] == 0
    assert not other.get("/api/golf/stats").json["statistics"]["all_time"]["achievements"][achievement]
    response = player.post("/_internal/games/v1/golf/delete-user", json={"user_id": 1, "request_id": "delete-" + achievement},
                           headers={"X-Cards-Service": "accounts", "Authorization": "Bearer " + app.config["GAME_ACCOUNT_TOKENS"]["golf"]})
    assert response.status_code == 200
    with app.app_context():
        assert AchievementUnlock.query.count() == 0
        assert Result.query.count() == 0


@pytest.mark.parametrize("holes, expected", [
    ([70], True), ([0, 70, -20], True), ([60], False), ([69], False),
    ([71], False), ([35, 35], False), ([], False),
])
@pytest.mark.parametrize("status", ["completed", "abandoned", "cancelled", "active"])
def test_day_job_requires_exactly_seventy_on_one_finished_hole(holes, expected, status):
    badges = summarize([result(holes, score=sum(holes), status=status)])["achievements"]
    assert badges["dont_quit_your_day_job"] == (expected and status != "active")


@pytest.mark.parametrize("mode", ["bot", "multiplayer"])
@pytest.mark.parametrize("went_out, expected_score", [(0, 70), (None, 60)])
def test_day_job_uses_the_existing_penalty_and_survives_reload(app, clients, mode, went_out, expected_score):
    game = engine.deal(2)
    data = {"game": game, "mode": mode, "startedAt": time.time(), "humanCount": 2,
            "seats": [{"userId": 1}, {"userId": 2}], "metrics": [{}, {}]}
    for player, ranks in zip(game["players"], [("Q", "J", "J", "J", "Q", "10"), ("A", "K", "3", "A", "K", "3")]):
        for cell, rank in zip(player["cards"], ranks):
            cell["card"]["rank"] = rank
    assert engine.score_grid(game["players"][0]["cards"]) == 60
    with app.app_context():
        engine.finish_hole(game, went_out=went_out)
        assert game["history"] == [[expected_score, 0]]
        app.extensions["golf_runtime"].next_turn(data)
        save_results(data, abandoned=True)
        db.session.commit()
        db.session.remove()
        stored = db.session.get(Result, (game["id"], 1))
        assert stored.score == expected_score and stored.detail["holes"] == [expected_score]
    stats = clients(1).get("/api/golf/stats").json["statistics"]
    assert stats["all_time"]["achievements"]["dont_quit_your_day_job"] == (went_out == 0)
    assert stats[mode]["achievements"]["dont_quit_your_day_job"] == (went_out == 0)
    other_mode = "multiplayer" if mode == "bot" else "bot"
    assert not stats[other_mode]["achievements"]["dont_quit_your_day_job"]
    assert not clients(2).get("/api/golf/stats").json["statistics"]["all_time"]["achievements"]["dont_quit_your_day_job"]


@pytest.mark.parametrize("before, final, won, expected", [
    ([8, 0], [-10, 0], True, True),
    ([0, 8], [0, -10], False, False),
    ([0, 0], [-1, 0], True, False),
    ([8, 8, 0], [-10, 0, 0], True, True),
])
def test_final_hole_comeback_and_pair_awards_are_saved_once(app, before, final, won, expected):
    game = engine.deal(len(before))
    game["history"] = [before] + [[0] * len(before) for _ in range(7)] + [final]
    for player, start, end in zip(game["players"], before, final):
        player["score"] = start + end
    data = {"game": game, "mode": "bot", "startedAt": time.time(), "humanCount": 1,
            "seats": [{"userId": 1, "utcOffsetMinutes": 420}] + [{} for _ in before[1:]],
            "metrics": [{"hole_in_one": True}] + [{} for _ in before[1:]]}
    with app.app_context():
        save_results(data, terminal=True)
        db.session.commit()
        stored = Result.query.one()
        assert stored.won == won
        assert stored.detail["utc_offset_minutes"] == 420
        badges = summarize([stored])["achievements"]
        assert badges["out_of_the_rough"] == expected
        assert badges["hole_in_one"]
        # A repeated terminal save cannot change an earned achievement.
        data["metrics"][0]["hole_in_one"] = False
        save_results(data, terminal=True)
        db.session.commit()
        assert Result.query.count() == 1
        assert Result.query.one().detail["hole_in_one"]


HOLIDAYS = [
    ("new_year", datetime(2026, 1, 1, 12)),
    ("lonely_heart", datetime(2026, 2, 14, 12)),
    ("lucky_clover", datetime(2026, 3, 17, 12)),
    ("easter_egg", datetime(2026, 4, 5, 12)),
    ("easter_egg", datetime(2027, 3, 28, 12)),
    ("fireworks", datetime(2026, 7, 4, 12)),
    ("spooky", datetime(2026, 10, 31, 12)),
    ("thankful", datetime(2026, 11, 26, 12)),
    ("thankful", datetime(2027, 11, 25, 12)),
    ("christmas_spirit", datetime(2026, 12, 25, 12)),
]


@pytest.mark.parametrize("key, day", HOLIDAYS)
def test_all_hearts_holidays_and_moving_dates(key, day):
    assert summarize([result(started=day)])["achievements"][key]
    for neighbor in [-1, 1]:
        assert not summarize([result(started=day + timedelta(days=neighbor))])["achievements"][key]
    assert not summarize([result(started=day, status="active")])["achievements"][key]


@pytest.mark.parametrize("utc_start, offset, spooky", [
    (datetime(2026, 11, 1, 3), 420, True),
    (datetime(2026, 10, 31, 3), 420, False),
    (datetime(2026, 10, 30, 23), -120, True),
    (datetime(2026, 10, 31, 12), 0, True),
])
def test_holidays_use_local_start_date_even_when_game_finishes_later(utc_start, offset, spooky):
    row = result(started=utc_start, utc_offset_minutes=offset)
    row.completed_at = datetime(2026, 11, 2)
    assert summarize([row])["achievements"]["spooky"] == spooky


def test_local_date_is_recorded_per_player_and_survives_results_reload(app, clients, monkeypatch):
    host, friend = clients(1), clients(2)
    host.golf_headers["X-Golf-UTC-Offset"] = "420"
    friend.golf_headers["X-Golf-UTC-Offset"] = "-120"
    response = host.post("/api/golf/lobbies", json={"players": 2, "requestId": str(uuid.uuid4())}, headers=host.golf_headers)
    code = response.json["state"]["code"]
    friend.post("/api/golf/lobbies/join", json={"code": code}, headers=friend.golf_headers)
    with app.app_context():
        runtime = app.extensions["golf_runtime"]
        row = db.session.get(Room, code)
        data = copy.deepcopy(row.data)
        monkeypatch.setattr("golf_server.runtime.time.time", lambda: datetime(2026, 11, 1, 3, tzinfo=timezone.utc).timestamp())
        runtime.begin(data)
        data["game"]["history"] = [[0, 1] for _ in range(9)]
        save_results(data, terminal=True)
        db.session.commit()
        db.session.remove()
    host_stats = host.get("/api/golf/stats").json["statistics"]
    friend_stats = friend.get("/api/golf/stats").json["statistics"]
    assert host_stats["all_time"]["achievements"]["spooky"]
    assert not friend_stats["all_time"]["achievements"]["spooky"]
    assert host_stats["multiplayer"]["achievements"]["spooky"]
    assert not host_stats["bot"]["achievements"]["spooky"]
    assert not host_stats["all_time"]["achievements"]["early_bird"]
    assert friend_stats["all_time"]["achievements"]["early_bird"]
    assert host_stats["all_time"]["achievements"]["better_with_friends"]


@pytest.mark.parametrize("offset", ["bad", "1.5", "-841", "721"])
def test_invalid_local_offsets_are_rejected(clients, offset):
    player = clients(1)
    player.golf_headers["X-Golf-UTC-Offset"] = offset
    response = player.post("/api/golf/bots", json={"players": 2, "requestId": str(uuid.uuid4())}, headers=player.golf_headers)
    assert response.status_code == 400


@pytest.mark.parametrize("hour, minute, night, early", [
    (0, 0, True, False), (4, 59, True, False), (5, 0, False, True),
    (7, 59, False, True), (8, 0, False, False), (23, 59, False, False),
])
@pytest.mark.parametrize("offset", [420, -330, 0])
def test_time_badges_use_local_start_and_require_completion(hour, minute, night, early, offset):
    local_start = datetime(2026, 6, 10, hour, minute)
    row = result(started=local_start + timedelta(minutes=offset), utc_offset_minutes=offset)
    row.completed_at = row.started_at + timedelta(days=1)
    badges = summarize([row])["achievements"]
    assert (badges["night_owl"], badges["early_bird"]) == (night, early)
    for status in ["active", "abandoned"]:
        row.status = status
        badges = summarize([row])["achievements"]
        assert not badges["night_owl"] and not badges["early_bird"]


def test_social_badges_use_real_multiplayer_completions_and_historical_streaks():
    for mode, humans, status, expected in [
        ("multiplayer", 2, "completed", True), ("multiplayer", 6, "completed", True),
        ("multiplayer", 2, "abandoned", False), ("multiplayer", 2, "active", False),
        ("multiplayer", 1, "completed", False), ("bot", 1, "completed", False),
    ]:
        badges = summarize([result(mode=mode, human_count=humans, status=status)])["achievements"]
        assert badges["better_with_friends"] == expected

    start = datetime(2026, 6, 10, 12)
    wins = [result(won=True, started=start + timedelta(days=i)) for i in range(5)]
    assert not summarize(wins[:4])["achievements"]["hot_streak"]
    assert summarize(list(reversed(wins)))["achievements"]["hot_streak"]
    loss = result(started=start + timedelta(days=6))
    stats = summarize([loss, *wins])
    assert stats["current_win_streak"] == 0
    assert stats["achievements"]["hot_streak"]
    wins[2].status, wins[2].won = "abandoned", False
    assert not summarize(wins)["achievements"]["hot_streak"]
    later_win = result(won=True, started=start + timedelta(days=7))
    stats = summarize([*wins, later_win])
    assert stats["current_win_streak"] == stats["best_win_streak"] == 5
    assert stats["achievements"]["hot_streak"]
    stats = summarize([*wins, later_win, result(status="abandoned", started=start + timedelta(days=8))])
    assert stats["current_win_streak"] == 5


def test_all_year_round_requires_all_eight_distinct_holidays_across_years():
    rows = [result(started=day) for key, day in HOLIDAYS if day.year == 2026]
    assert len(rows) == 8
    assert not summarize([])["achievements"]["all_year_round"]
    assert not summarize(rows[:-1])["achievements"]["all_year_round"]
    rows[-1].started_at = datetime(2027, 12, 25, 12)
    assert summarize(rows)["achievements"]["all_year_round"]


def test_geezer_is_persistent_account_owned_and_idempotent(app, clients):
    player, other = clients(1), clients(2)
    assert not player.get("/api/golf/stats").json["statistics"]["all_time"]["achievements"]["geezer"]
    for _ in range(2):
        response = player.post("/api/golf/achievements", json={"id": "geezer", "user_id": 2}, headers=player.golf_headers)
        assert response.status_code == 200
        assert response.json == {"unlocks": ["geezer"]}
    with app.app_context():
        db.session.remove()
        assert AchievementUnlock.query.count() == 1
        assert AchievementUnlock.query.one().user_id == 1
        assert Result.query.count() == 0
    for stats in player.get("/api/golf/stats").json["statistics"].values():
        assert stats["achievements"]["geezer"]
        assert stats["games_started"] == 0
    assert not other.get("/api/golf/stats").json["statistics"]["all_time"]["achievements"]["geezer"]


def test_settings_unlocks_require_account_csrf_origin_and_allowlisted_id(app, clients):
    player, guest = clients(1), clients()
    path = "/api/golf/achievements"
    assert guest.post(path, json={"id": "geezer"}, headers=guest.golf_headers).status_code == 401
    assert player.post(path, json={"id": "geezer"}).status_code == 403
    assert player.post(path, json={"id": "geezer"}, headers={**player.golf_headers, "Origin": "https://evil.example"}).status_code == 403
    for value in ["six_of_a_kind", "deuce_almighty", "dont_quit_your_day_job", "night_owl", "better_with_friends", "hot_streak", "all_year_round", None, []]:
        assert player.post(path, json={"id": value}, headers=player.golf_headers).status_code == 400
    with app.app_context():
        assert AchievementUnlock.query.count() == 0


def test_account_deletion_removes_settings_achievements_and_prevents_recreation(app, clients):
    player, other = clients(1), clients(2)
    for person in [player, other]:
        assert person.post("/api/golf/achievements", json={"id": "geezer"}, headers=person.golf_headers).status_code == 200
    response = player.post("/_internal/games/v1/golf/delete-user", json={"user_id": 1, "request_id": "delete-geezer"},
                           headers={"X-Cards-Service": "accounts", "Authorization": "Bearer " + app.config["GAME_ACCOUNT_TOKENS"]["golf"]})
    assert response.status_code == 200
    assert player.post("/api/golf/achievements", json={"id": "geezer"}, headers=player.golf_headers).status_code == 401
    with app.app_context():
        assert [row.user_id for row in AchievementUnlock.query.all()] == [2]
