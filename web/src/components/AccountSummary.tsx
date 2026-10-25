import { useEffect, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCardsBlank, faTrophy, faStars, faSnowflake, faBullseye, faFlag, faCrown, faUsers, faLock } from "@fortawesome/pro-solid-svg-icons";
import { Sparkle } from "./Sparkle";
import { Tooltip } from "./Tooltip";
import { golfGet, type AccountStatistics, type GolfMode } from "@/lib/golfApi";
import { StatisticsTabs, StatisticsViewToggle } from "./StatisticsTabs";
import styles from "@/styles/account-summary.module.css";

export function AccountSummary({ userId }: { userId: string }) {
  const [data, setData] = useState<AccountStatistics | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [mode, setMode] = useState<"all_time" | "separate">("all_time");
  const [category, setCategory] = useState<GolfMode>("bot");
  const [selected, setSelected] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    setData(null); setError("");
    const refresh = () => {
      void golfGet<{ statistics: AccountStatistics }>("/stats", controller.signal).then(next => {
        if (!controller.signal.aborted) setData(next.statistics);
      }).catch(e => { if (!controller.signal.aborted) setError(e.message); });
    };
    refresh();
    window.addEventListener("focus", refresh);
    window.addEventListener("golf:results", refresh);
    return () => { controller.abort(); window.removeEventListener("focus", refresh); window.removeEventListener("golf:results", refresh); };
  }, [userId, attempt]);
  const stats = data?.[mode === "all_time" ? "all_time" : category];
  const show = (value: number | null | undefined) => value ?? "—";
  const rows = stats ? [
    [["Games Played", stats.games_played], ["Games Won", stats.games_won], ["Win Rate", `${stats.win_rate}%`], ["Holes Played", stats.holes_played],
     ["Best Score", show(stats.best_score)]],
    [["Average Score", show(stats.average_score)], ["Best Hole", show(stats.best_hole)], ["Negative Holes", stats.negative_holes],
     ["Best Win Streak", stats.best_win_streak], ["Matching Pairs", stats.pairs]],
  ] : [];
  const earned = data?.all_time.achievements || {};
  const badges = [
    { name: "Newcomer", desc: "Finish your first nine-hole game.", icon: faCardsBlank, earned: earned.first_game },
    { name: "First Light", desc: "Win your first game. Shared wins count, too.", icon: faTrophy, earned: earned.first_win },
    { name: "Written in the Stars", desc: "Win ten games.", icon: faStars, earned: earned.ten_wins },
    { name: "Below Zero", desc: "Finish a hole with a negative score.", icon: faSnowflake, earned: earned.negative_hole },
    { name: "Right on Target", desc: "Score exactly zero on a hole.", icon: faBullseye, earned: earned.zero_hole },
    { name: "Under Par", desc: "Finish all nine holes with a negative total.", icon: faFlag, earned: earned.negative_game },
    { name: "Flawless Nine", desc: "Score zero or less on every hole in a game.", icon: faCrown, earned: earned.flawless_nine },
    { name: "Full House", desc: "Win a game with six players.", icon: faUsers, earned: earned.full_house },
  ];

  return <div className={styles.summary}>
    <section aria-labelledby="statistics-title">
      <h2 id="statistics-title" className={styles.sectionTitle}>Game Statistics</h2>
      <StatisticsViewToggle value={mode} onChange={setMode} />
      {mode === "separate" && <StatisticsTabs value={category} onChange={setCategory} />}
      {error && <p role="alert" className="inline-error">{error}{" "}<button type="button" className="link" onClick={() => setAttempt(n => n + 1)}>Try again</button></p>}
      {!data && !error && <p role="status">Loading statistics…</p>}
      {stats && <div className={styles.statsCard} aria-label="Your statistics">
        {rows.map((column, index) => <dl key={index} className={styles.statsColumn}>
          {column.map(([label, value]) => <div key={label} className={styles.statsRow}>
            <dt>{label}</dt><dd>{value}</dd>
          </div>)}
        </dl>)}
      </div>}
    </section>
    <section aria-labelledby="achievements-title" className={styles.achievements}>
      <h2 id="achievements-title" className={styles.sectionTitle}>Achievements</h2>
      <div className={styles.badgeGrid}>
        {badges.map(badge => <div key={badge.name} className={styles.achievement}>
          <Tooltip open={selected === badge.name}
            onOpenChange={open => setSelected(current => open ? badge.name : current === badge.name ? null : current)}
            content={<div className={styles.tooltipContent}>
              <span className={styles.tooltipName}>{badge.name}</span>
              <span className={styles.tooltipDesc}>{badge.desc}</span>
              <span className={styles.tooltipStatus}>{badge.earned ? "Unlocked" : "Locked"}</span>
            </div>}>
          <button type="button" className={styles.badge} data-earned={badge.earned}
            aria-label={`${badge.name}: ${badge.earned ? "Unlocked" : "Locked"}`}
            onClick={event => {
              event.preventDefault();
              setSelected(selected === badge.name ? null : badge.name);
            }}>
            {badge.earned && <><span className={styles.shine} /><Sparkle className={styles.sparkle} fill="white" /></>}
            <FontAwesomeIcon icon={badge.earned ? badge.icon : faLock} />
          </button>
          </Tooltip>
          <span className={styles.badgeLabel} data-earned={badge.earned}>{badge.name}</span>
        </div>)}
      </div>
    </section>
  </div>;
}
