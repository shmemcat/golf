"""Golf-only, idempotent account results and global rankings."""
from datetime import datetime
import time
from .extensions import db
from .models import AchievementUnlock, DeletedUser, Result
from .engine import visible_bonus
from .achievements import holiday_achievements, social_achievements

COUNTERS = ("deck_draws", "discard_draws", "replacements", "discarded_draws", "cards_revealed", "autoplay_turns")


def save_results(data, terminal=False, abandoned=False, cancelled=False):
    game = data.get("game")
    if not game:
        return
    now = datetime.utcnow()
    scores = [p["score"] for p in game["players"]]
    before_final = ([sum(hole[seat] for hole in game["history"][:8]) for seat in range(len(scores))]
                    if len(game["history"]) == 9 else None)
    for seat, person in enumerate(data["seats"]):
        uid = person.get("userId")
        if not uid or db.session.get(DeletedUser, uid):
            continue
        key = (game["id"], uid)
        result = db.session.get(Result, key)
        if result and result.status != "active":
            continue
        result = result or Result(game_id=game["id"], user_id=uid, mode=data["mode"], started_at=datetime.utcfromtimestamp(data["startedAt"]))
        result.status = "abandoned" if abandoned or person.get("left") else "cancelled" if cancelled else "completed" if terminal else "active"
        result.completed_at = now if result.status != "active" else None
        result.score = scores[seat]
        result.won = bool(terminal and not abandoned and not person.get("left") and scores[seat] == min(scores))
        holes = [hole[seat] for hole in game["history"]]
        result.detail = {
            "scores": scores, "holes": holes, "player_count": len(scores),
            "human_count": data["humanCount"], "duration_seconds": max(0, int(time.time() - data["startedAt"])),
            "placement": 1 + sum(score < scores[seat] for score in scores),
            "shared_win": result.won and scores.count(min(scores)) > 1,
            "utc_offset_minutes": person.get("utcOffsetMinutes", 0),
            "hole_in_one": bool(data["metrics"][seat].get("hole_in_one")),
            "out_of_the_rough": bool(result.won and before_final
                                     and before_final[seat] == max(before_final)
                                     and before_final[seat] > min(before_final)),
            "pairs": data["metrics"][seat].get("pairs", 0),
            "bonus_blocks": data["metrics"][seat].get("bonus_blocks", 0),
            **{counter: data["metrics"][seat].get(counter, 0) for counter in COUNTERS},
        }
        db.session.add(result)


def count_hole(data):
    for seat, player in enumerate(data["game"]["players"]):
        cards = player["cards"]
        pairs = sum(cards[i]["card"]["rank"] == cards[i + 3]["card"]["rank"] for i in range(3))
        data["metrics"][seat]["pairs"] = data["metrics"][seat].get("pairs", 0) + pairs
        if pairs == 3:
            data["metrics"][seat]["hole_in_one"] = True
        data["metrics"][seat]["bonus_blocks"] = data["metrics"][seat].get("bonus_blocks", 0) + int(visible_bonus(cards))


def summarize(rows, unlocks=()):
    finished = [row for row in rows if row.status != "active"]
    completed = [row for row in finished if row.status == "completed"]
    holes = [hole for row in finished for hole in row.detail.get("holes", [])]
    totals = [row.score for row in completed]
    streak = longest = current = 0
    for row in sorted(completed, key=lambda r: (r.completed_at or r.started_at, r.game_id)):
        current = current + 1 if row.won else 0
        longest = max(longest, current)
    streak = current
    won = sum(row.won for row in completed)
    holidays = holiday_achievements(finished)
    return {
        "games_started": len(rows), "games_played": len(completed), "games_completed": len(completed),
        "games_won": won, "games_lost": len(completed) - won, "games_abandoned": sum(row.status == "abandoned" for row in finished),
        "win_rate": round(100 * won / len(completed), 1) if completed else 0,
        "current_win_streak": streak, "best_win_streak": longest,
        "holes_played": len(holes), "best_score": min(totals) if totals else None,
        "worst_score": max(totals) if totals else None,
        "average_score": round(sum(totals) / len(totals), 1) if totals else None,
        "best_hole": min(holes) if holes else None, "worst_hole": max(holes) if holes else None,
        "negative_holes": sum(hole < 0 for hole in holes), "zero_holes": holes.count(0),
        "pairs": sum(row.detail.get("pairs", 0) for row in finished),
        "bonus_blocks": sum(row.detail.get("bonus_blocks", 0) for row in finished),
        "shared_wins": sum(bool(row.detail.get("shared_win")) for row in completed),
        **{key: sum(row.detail.get(key, 0) for row in finished) for key in COUNTERS},
        "achievements": {
            "first_game": bool(completed), "first_win": won > 0, "ten_wins": won >= 10,
            "negative_hole": any(h < 0 for h in holes), "zero_hole": 0 in holes,
            "negative_game": any(row.score < 0 for row in completed),
            "flawless_nine": any(len(row.detail.get("holes", [])) == 9 and all(h <= 0 for h in row.detail["holes"]) for row in completed),
            "full_house": any(row.won and row.detail.get("player_count") == 6 for row in completed),
            "birdie": -1 in holes, "eagle": -2 in holes,
            "hole_in_one": any(row.detail.get("hole_in_one", False) for row in finished),
            "up_and_down": any(any(a > 0 and b < 0 for a, b in zip(row.detail.get("holes", []), row.detail.get("holes", [])[1:]))
                               for row in finished),
            "out_of_the_rough": any(row.won and row.detail.get("out_of_the_rough", False) for row in completed),
            "photo_finish": any(row.won and len(row.detail.get("scores", [])) >= 2
                                and sorted(row.detail["scores"])[1] - row.score == 1 for row in completed),
            "sunday_best": any(row.score <= -18 for row in completed),
            "hot_streak": longest >= 5,
            "geezer": "geezer" in unlocks,
            "all_year_round": all(holidays.values()),
            **social_achievements(completed),
            **holidays,
        },
    }


def account_statistics(user_id):
    rows = Result.query.filter_by(user_id=user_id).all()
    unlocks = {row.achievement_id for row in AchievementUnlock.query.filter_by(user_id=user_id).all()}
    return {"all_time": summarize(rows, unlocks), "bot": summarize([r for r in rows if r.mode == "bot"], unlocks),
            "multiplayer": summarize([r for r in rows if r.mode == "multiplayer"], unlocks)}


def leaderboard(mode, accounts):
    from sqlalchemy import func
    month = datetime.utcnow().replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    def rankings(monthly):
        query = db.session.query(Result.user_id, func.count(Result.game_id).label("wins")).filter(
            Result.mode == mode, Result.status == "completed", Result.won.is_(True),
            ~Result.user_id.in_(db.session.query(DeletedUser.user_id)))
        if monthly:
            query = query.filter(Result.completed_at >= month)
        rows = query.group_by(Result.user_id).order_by(func.count(Result.game_id).desc(), Result.user_id).all()
        # Profiles come only from Cards; deleted/private account identities disappear.
        profiles = accounts.public_profiles([uid for uid, _ in rows])
        visible = [(profiles[uid], wins) for uid, wins in rows if uid in profiles][:10]
        return [{"rank": i + 1, "username": p.username, "profile_icon": p.profile_icon, "games_won": wins} for i, (p, wins) in enumerate(visible)]
    return {"monthly": rankings(True), "all_time": rankings(False)}
