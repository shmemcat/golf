import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faLock, faQuestion } from "@fortawesome/pro-solid-svg-icons";
import type { Achievement } from "@/lib/achievements";
import { Sparkle } from "./Sparkle";
import { Tooltip } from "./Tooltip";
import styles from "@/styles/account-summary.module.css";

export function AchievementBadge({ badge, open, onOpenChange }: {
  badge: Achievement;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const hidden = badge.secret && !badge.earned;
  const name = hidden ? "????" : badge.name;
  const desc = hidden ? "This is a secret achievement" : badge.desc;
  const tierLabel = !hidden && badge.tier ? badge.tier[0].toUpperCase() + badge.tier.slice(1) : "";
  return <div className={styles.achievement}>
    <Tooltip open={open} onOpenChange={onOpenChange}
      content={<div className={styles.tooltipContent}>
        {tierLabel && <span className={styles.tooltipTier}>{tierLabel}</span>}
        <span className={styles.tooltipName}>{name}</span>
        <span className={styles.tooltipDesc}>{desc}</span>
        {!hidden && badge.flavorText && <span className={styles.tooltipFlavor}>{badge.flavorText}</span>}
        {!hidden && badge.progress && <span className={styles.tooltipProgress}>{badge.progress}</span>}
        {!hidden && badge.next && <span className={styles.tooltipProgress}>{badge.next}</span>}
      </div>}>
      <button type="button" className={styles.badge} data-earned={badge.earned} data-tier={hidden ? undefined : badge.tier}
        aria-label={hidden ? "Secret achievement: Locked" : `${name}: ${tierLabel ? `${tierLabel}, ` : ""}${badge.earned ? "Unlocked" : "Locked"}`}
        onClick={event => { event.preventDefault(); onOpenChange(!open); }}>
        {badge.earned && <><span className={styles.shine} /><Sparkle className={styles.sparkle} fill="white" /></>}
        <FontAwesomeIcon className={styles.badgeIcon} icon={badge.earned ? badge.icon : hidden ? faQuestion : faLock} />
      </button>
    </Tooltip>
    <span className={styles.badgeLabel} data-earned={badge.earned}>{name}</span>
  </div>;
}
