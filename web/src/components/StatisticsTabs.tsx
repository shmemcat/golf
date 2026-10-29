import type { GolfMode } from "@/lib/golfApi";
import styles from "@/styles/statistics.module.css";
import buttons from "@/styles/buttons.module.css";

type TabsProps = { value: GolfMode; onChange: (value: GolfMode) => void; leaderboard?: false }
  | { value: GolfMode | "achievements"; onChange: (value: GolfMode | "achievements") => void; leaderboard: true };

export function StatisticsTabs(props: TabsProps) {
  return <div className={styles.tabs} role="group" aria-label={props.leaderboard ? "Leaderboard category" : "Statistics category"}>
    {(["bot", "multiplayer"] as const).map(mode => <button key={mode} type="button" aria-pressed={props.value === mode} onClick={() => props.onChange(mode)}>
      {mode === "bot" ? "Against Bots" : "Multiplayer"}
    </button>)}
    {props.leaderboard && <button type="button" aria-pressed={props.value === "achievements"} onClick={() => props.onChange("achievements")}>Achievements</button>}
  </div>;
}

export function StatisticsViewToggle({ value, onChange }: { value: "all_time" | "separate"; onChange: (value: "all_time" | "separate") => void }) {
  return <div className={styles.toggle} role="group" aria-label="Statistics view">
    {(["all_time", "separate"] as const).map(view => <button key={view} type="button" className={`${buttons["toggle-button"]} ${value === view ? buttons["toggle-button-active"] : ""}`} aria-pressed={value === view} onClick={() => onChange(view)}>
      {value !== view && <span className={buttons["button-shine"]} aria-hidden="true" />}{view === "all_time" ? "All Time" : "Separate"}
    </button>)}
  </div>;
}
