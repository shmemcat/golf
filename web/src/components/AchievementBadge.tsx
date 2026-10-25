import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faLock } from "@fortawesome/pro-solid-svg-icons";
import type { Achievement } from "@/lib/achievements";
import { Sparkle } from "./Sparkle";
import { Tooltip } from "./Tooltip";
import styles from "@/styles/account-summary.module.css";

export function AchievementBadge({ badge, open, onOpenChange }: {
  badge: Achievement;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const tierLabel = badge.tier ? badge.tier[0].toUpperCase() + badge.tier.slice(1) : "";
  return <div className={styles.achievement}>
    <Tooltip open={open} onOpenChange={onOpenChange}
      content={<div className={styles.tooltipContent}>
        {tierLabel && <span className={styles.tooltipTier}>{tierLabel}</span>}
        <span className={styles.tooltipName}>{badge.name}</span>
        <span className={styles.tooltipDesc}>{badge.desc}</span>
        {badge.progress && <span className={styles.tooltipProgress}>{badge.progress}</span>}
        {badge.next && <span className={styles.tooltipProgress}>{badge.next}</span>}
        <span className={styles.tooltipStatus}>{badge.earned ? "Unlocked" : "Locked"}</span>
      </div>}>
      <button type="button" className={styles.badge} data-earned={badge.earned} data-tier={badge.tier}
        aria-label={`${badge.name}: ${tierLabel ? `${tierLabel}, ` : ""}${badge.earned ? "Unlocked" : "Locked"}`}
        onClick={event => { event.preventDefault(); onOpenChange(!open); }}>
        {badge.earned && <><span className={styles.shine} /><Sparkle className={styles.sparkle} fill="white" /></>}
        <FontAwesomeIcon className={styles.badgeIcon} icon={badge.earned ? badge.icon : faLock} />
      </button>
    </Tooltip>
    <span className={styles.badgeLabel} data-earned={badge.earned}>{badge.name}</span>
  </div>;
}
