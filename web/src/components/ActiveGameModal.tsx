import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "./Buttons";
import styles from "./ActiveGameModal.module.css";

export function ActiveGameModal({ title, message, continueLabel, leaveLabel, confirmMessage, busy, leaveDisabled, error, onContinue, onLeave }: {
  title: string; message: string; continueLabel: string; leaveLabel: string; confirmMessage: string;
  busy: boolean; leaveDisabled: boolean; error: string; onContinue: () => void; onLeave: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const body = useRef<HTMLDivElement>(null);
  const id = useId();
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const buttons = () => [...(body.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? [])];
    (buttons()[0] ?? body.current)?.focus();
    const trap = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const items = buttons();
      const index = items.indexOf(document.activeElement as HTMLButtonElement);
      if (!items.length) { event.preventDefault(); body.current?.focus(); }
      else if (index < 0 || (!event.shiftKey && index === items.length - 1) || (event.shiftKey && index === 0)) {
        event.preventDefault();
        items[event.shiftKey ? items.length - 1 : 0].focus();
      }
    };
    document.addEventListener("keydown", trap);
    return () => { document.body.style.overflow = overflow; document.removeEventListener("keydown", trap); previous?.focus(); };
  }, []);
  useEffect(() => { body.current?.querySelector<HTMLButtonElement>(confirming ? "[data-cancel]" : "button")?.focus(); }, [confirming]);
  return createPortal(<div className={styles.backdrop}>
    <div ref={body} className={styles.modal} role="dialog" aria-modal="true" aria-labelledby={`${id}-title`} aria-describedby={`${id}-message`} aria-busy={busy} tabIndex={-1}>
      <h2 id={`${id}-title`}>{confirming ? "Are you sure?" : title}</h2>
      <p id={`${id}-message`}>{confirming ? confirmMessage : message}</p>
      <div className="button-stack">
        {confirming ? <>
          <Button name={busy ? "Leaving…" : "Yes"} disabled={busy || leaveDisabled} onClick={onLeave} />
          <Button name="No" disabled={busy} data-cancel onClick={() => setConfirming(false)} />
        </> : <>
          <Button name={continueLabel} disabled={busy} onClick={onContinue} />
          <Button name={leaveLabel} disabled={busy || leaveDisabled} onClick={() => setConfirming(true)} />
        </>}
      </div>
      {error && <p className="inline-error" role="alert">{error}</p>}
    </div>
  </div>, document.body);
}
