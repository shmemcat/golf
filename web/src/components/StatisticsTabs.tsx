import type { GolfMode } from "@/lib/golfApi";
import styles from "@/styles/statistics.module.css";
import buttons from "@/styles/buttons.module.css";

export function StatisticsTabs({ value, onChange, leaderboard = false }: { value: GolfMode; onChange: (value: GolfMode) => void; leaderboard?: boolean }) {
  return <div className={styles.tabs} role="group" aria-label={leaderboard ? "Leaderboard category" : "Statistics category"}>
    {(["bot", "multiplayer"] as const).map(mode => <button key={mode} type="button" aria-pressed={value === mode} onClick={() => onChange(mode)}>
      {mode === "bot" ? "Against Bots" : "Multiplayer"}
    </button>)}
  </div>;
}

export function StatisticsViewToggle({ value, onChange }: { value: "all_time" | "separate"; onChange: (value: "all_time" | "separate") => void }) {
  return <div className={styles.toggle} role="group" aria-label="Statistics view">
    {(["all_time", "separate"] as const).map(view => <button key={view} type="button" className={`${buttons["toggle-button"]} ${value === view ? buttons["toggle-button-active"] : ""}`} aria-pressed={value === view} onClick={() => onChange(view)}>
      {value !== view && <span className={buttons["button-shine"]} aria-hidden="true" />}{view === "all_time" ? "All Time" : "Separate"}
    </button>)}
  </div>;
}
