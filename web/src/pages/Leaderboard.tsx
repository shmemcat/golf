import { useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
import { PageLayout } from "@/components/ui/PageLayout";
import { Button, MenuLink } from "@/components/Buttons";
import { LeaderboardColumn } from "@/components/LeaderboardColumn";
import { StatisticsTabs } from "@/components/StatisticsTabs";
import { golfGet, type GolfMode, type Rankings } from "@/lib/golfApi";
import styles from "@/styles/leaderboard.module.css";

export default function Leaderboard() {
  const [mode, setMode] = useState<GolfMode>("bot");
  const [data, setData] = useState<Rankings | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setData(null); setError("");
    void golfGet<Rankings>(`/leaderboard?mode=${mode}`, controller.signal).then(next => { if (!controller.signal.aborted) setData(next); })
      .catch(e => { if (!controller.signal.aborted) setError(e.message); });
    return () => controller.abort();
  }, [mode, attempt]);
  return <><Helmet><title>Leaderboard | Golf</title></Helmet><PageLayout title="LEADERBOARD">
    <StatisticsTabs value={mode} onChange={setMode} leaderboard />
    {!data && !error && <p role="status">Loading scores…</p>}
    {error && <div className="button-stack"><p role="alert" className="inline-error">{error}</p><Button name="Try again" onClick={() => setAttempt(n => n + 1)} /></div>}
    {data && <div className={styles.columns}>{(["monthly", "all_time"] as const).map(period => <LeaderboardColumn key={period}
      title={period === "monthly" ? "Monthly" : "All-Time"} category={mode} entries={data[period]} />)}</div>}
    <div className="button-stack"><MenuLink to="/" name="Home" /></div>
  </PageLayout></>;
}
