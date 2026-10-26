import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useAuth } from "@/context/AuthContext";
import { ACHIEVEMENT_EVENT, computeAchievements, type Achievement } from "@/lib/achievements";
import { golfGet, type AccountStatistics } from "@/lib/golfApi";
import { readStorage, writeStorage } from "@/lib/storage";
import styles from "@/styles/achievement-notifications.module.css";

const unlockId = (badge: Achievement) => badge.tier ? `${badge.id}_${badge.tier}` : badge.id;
const MAX_VISIBLE_TOASTS = 3;

export function AchievementNotifications() {
  const { user } = useAuth();
  return user ? <AccountNotifications key={user.id} userId={user.id} /> : null;
}

function AccountNotifications({ userId }: { userId: string }) {
  const [notice, setNotice] = useState<Achievement[]>([]);
  const [portalTarget, setPortalTarget] = useState<HTMLElement>(document.body);
  const seenRef = useRef<Set<string> | null>(null);

  useEffect(() => {
    // Native modal dialogs cover and disable content outside their top layer.
    let currentTarget: HTMLElement = document.body;
    const updateTarget = () => {
      const dialogs = document.querySelectorAll<HTMLDialogElement>("dialog[open]");
      const target = dialogs[dialogs.length - 1] ?? document.body;
      if (target === currentTarget) return;
      currentTarget = target;
      setPortalTarget(target);
    };
    const observer = new MutationObserver(updateTarget);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["open"] });
    updateTarget();
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const key = `golf.achievements-seen.v1:${encodeURIComponent(userId)}`;
    let controller: AbortController;
    const refresh = () => {
      controller?.abort();
      controller = new AbortController();
      const { signal } = controller;
      void golfGet<{ statistics: AccountStatistics }>("/stats", signal).then(({ statistics }) => {
        if (signal.aborted) return;
        const earned = computeAchievements(statistics.all_time).filter(badge => badge.earned);
        const raw = readStorage<unknown>(key, null);
        const initialized = seenRef.current !== null || Array.isArray(raw);
        // Keep a memory copy so blocked browser storage cannot cause repeat notices.
        const seen = new Set(seenRef.current);
        if (Array.isArray(raw)) raw.forEach(id => { if (typeof id === "string") seen.add(id); });
        const fresh = earned.filter(badge => !seen.has(unlockId(badge)));
        earned.forEach(badge => {
          seen.add(unlockId(badge));
          // A higher tier also claims its earlier tiers, including on a new browser.
          if (badge.tier) {
            for (const tier of ["bronze", "silver", "gold"]) {
              seen.add(`${badge.id}_${tier}`);
              if (tier === badge.tier) break;
            }
          }
        });
        seenRef.current = seen;
        writeStorage(key, [...seen]);
        // Seed historical achievements quietly on the first successful load.
        if (initialized && fresh.length) setNotice(previous => [...previous, ...fresh]);
      }).catch(() => { /* Retry on the next result, settings change or reconnect. */ });
    };
    const events = ["golf:results", ACHIEVEMENT_EVENT, "focus", "online"];
    events.forEach(event => window.addEventListener(event, refresh));
    refresh();
    return () => {
      controller.abort();
      events.forEach(event => window.removeEventListener(event, refresh));
    };
  }, [userId]);

  useEffect(() => {
    if (!notice.length) return;
    const timer = window.setTimeout(() => setNotice(previous => previous.slice(MAX_VISIBLE_TOASTS)), 3000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  if (!notice.length) return null;
  const visible = notice.slice(0, MAX_VISIBLE_TOASTS);
  const extra = notice.length - visible.length;
  return createPortal(
    <div className={styles.stack} role="status" aria-live="polite" aria-atomic="true">
      {visible.map((badge, index) => <div key={unlockId(badge)} className={styles.toast}>
        <FontAwesomeIcon icon={badge.icon} className={styles.icon} data-tier={badge.tier} />
        <div className={styles.text}>
          <div className={styles.label}>Achievement Unlocked!</div>
          <div className={styles.name}>{badge.name}</div>
          {index === visible.length - 1 && extra > 0 && <div className={styles.more}>+{extra} more</div>}
        </div>
        <button type="button" className={styles.dismiss} aria-label={`Dismiss ${badge.name} achievement notification`}
          onClick={() => setNotice(previous => previous.filter(item => unlockId(item) !== unlockId(badge)))}>×</button>
      </div>)}
    </div>, portalTarget
  );
}
