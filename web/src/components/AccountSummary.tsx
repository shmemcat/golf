import { useEffect, useState } from "react";
import { AchievementBadge } from "./AchievementBadge";
import { ACHIEVEMENT_EVENT, computeAchievements } from "@/lib/achievements";
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
    window.addEventListener(ACHIEVEMENT_EVENT, refresh);
    return () => {
      controller.abort(); window.removeEventListener("focus", refresh);
      window.removeEventListener("golf:results", refresh); window.removeEventListener(ACHIEVEMENT_EVENT, refresh);
    };
  }, [userId, attempt]);
  const stats = data?.[mode === "all_time" ? "all_time" : category];
  const show = (value: number | null | undefined) => value ?? "—";
  const rows = stats ? [
    [["Games Played", stats.games_played], ["Games Won", stats.games_won], ["Win Rate", `${stats.win_rate}%`], ["Holes Played", stats.holes_played],
     ["Best Score", show(stats.best_score)]],
    [["Average Score", show(stats.average_score)], ["Best Hole", show(stats.best_hole)], ["Negative Holes", stats.negative_holes],
     ["Best Win Streak", stats.best_win_streak], ["Matching Pairs", stats.pairs]],
  ] : [];
  const badges = computeAchievements(data?.all_time);

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
        {badges.map(badge => <AchievementBadge key={badge.id} badge={badge} open={selected === badge.id}
          onOpenChange={open => setSelected(current => open ? badge.id : current === badge.id ? null : current)} />)}
      </div>
    </section>
  </div>;
}
