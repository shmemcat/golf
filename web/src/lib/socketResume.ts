/** A suspended mobile page must resync with its server-owned session on return. */
export function resumeOnWake(reconnect: () => void, refresh: () => void) {
  const visible = () => { if (document.visibilityState !== "hidden") reconnect(); };
  const focus = () => { if (document.visibilityState !== "hidden") refresh(); };
  const pageshow = (event: PageTransitionEvent) => { if (event.persisted) visible(); else focus(); };
  document.addEventListener("visibilitychange", visible);
  window.addEventListener("online", visible);
  window.addEventListener("focus", focus);
  window.addEventListener("pageshow", pageshow);
  return () => {
    document.removeEventListener("visibilitychange", visible);
    window.removeEventListener("online", visible);
    window.removeEventListener("focus", focus);
    window.removeEventListener("pageshow", pageshow);
  };
}
