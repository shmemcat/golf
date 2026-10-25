"""Calendar and social achievements shared in spirit with Hearts and Euchre."""
from datetime import date, timedelta


FIXED_HOLIDAYS = {
    "new_year": (1, 1),
    "lonely_heart": (2, 14),
    "lucky_clover": (3, 17),
    "fireworks": (7, 4),
    "spooky": (10, 31),
    "christmas_spirit": (12, 25),
}


def easter_date(year):
    """Easter Sunday using the Gregorian algorithm used by Hearts."""
    a = year % 19
    b, c = divmod(year, 100)
    d, e = divmod(b, 4)
    f = (b + 8) // 25
    g = (b - f + 1) // 3
    h = (19 * a + b - d - g + 15) % 30
    i, k = divmod(c, 4)
    l = (32 + 2 * e + 2 * i - h - k) % 7
    m = (a + 11 * h + 22 * l) // 451
    month, day = divmod(h + l - 7 * m + 114, 31)
    return date(year, month, day + 1)


def thanksgiving_date(year):
    """The fourth Thursday of November, as in Hearts."""
    first = date(year, 11, 1)
    return date(year, 11, 1 + (3 - first.weekday()) % 7 + 21)


def holiday_achievements(rows):
    # Old results have no local offset; their authoritative UTC start is retained.
    dates = {
        (row.started_at - timedelta(minutes=row.detail.get("utc_offset_minutes", 0))).date()
        for row in rows
    }
    return {
        **{key: any((day.month, day.day) == holiday for day in dates)
           for key, holiday in FIXED_HOLIDAYS.items()},
        "easter_egg": any(day == easter_date(day.year) for day in dates),
        "thankful": any(day == thanksgiving_date(day.year) for day in dates),
    }


def social_achievements(completed):
    starts = [row.started_at - timedelta(minutes=row.detail.get("utc_offset_minutes", 0))
              for row in completed]
    return {
        "night_owl": any(start.hour < 5 for start in starts),
        "early_bird": any(5 <= start.hour < 8 for start in starts),
        "better_with_friends": any(row.mode == "multiplayer" and row.detail.get("human_count", 0) >= 2
                                   for row in completed),
    }
