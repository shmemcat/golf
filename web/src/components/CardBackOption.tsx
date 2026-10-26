import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Card } from "@/components/Card";
import { Button } from "@/components/Buttons";
import { useCardBack } from "@/context/CardBackContext";
import { CARD_BACKS, SELECTABLE_CARD_BACKS } from "@/lib/cardBacks";
import styles from "@/styles/card-back-option.module.css";

export function CardBackOption() {
  const { cardBack, saving, error, available, choose } = useCardBack();
  const group = useId();
  const [libraryOpen, setLibraryOpen] = useState(false);
  const current = CARD_BACKS.find(back => back.id === cardBack) ?? CARD_BACKS[0];
  const choices = SELECTABLE_CARD_BACKS.some(back => back.id === cardBack) ? SELECTABLE_CARD_BACKS : [...SELECTABLE_CARD_BACKS, current];
  return <section className={styles.section} aria-label="Card back">
    <h2>Card Back</h2>
    <div className={styles.compact}>
      <span className={styles.compactPreview} aria-hidden="true"><Card back={current.id} /></span>
      <div className={styles.compactDetails}><h3>{current.name}</h3><Button name="Change design" onClick={() => setLibraryOpen(true)} /></div>
    </div>
    {libraryOpen && <CardBackLibrary onClose={() => setLibraryOpen(false)}>
      <fieldset className={styles.choices} disabled={!available || saving} aria-busy={saving}>
        <legend className="sr-only">Card back design</legend>
        {choices.map(back => <label className={styles.choice} data-selected={cardBack === back.id} key={back.id}>
          <input type="radio" name={group} value={back.id} checked={cardBack === back.id} onChange={async event => {
            const input = event.currentTarget;
            await choose(back.id);
            if (input.isConnected) input.focus();
          }} />
          <span className={styles.preview} aria-hidden="true"><Card back={back.id} /></span>
          <span className={styles.choiceName}>{back.name}</span>
        </label>)}
      </fieldset>
      {saving && <p className="sr-only" role="status">Saving card back…</p>}
      {error && <p role="alert">{error}</p>}
    </CardBackLibrary>}
    {!libraryOpen && error && <p role="alert">{error}</p>}
  </section>;
}

function CardBackLibrary({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const title = useId();
  useEffect(() => {
    const element = dialog.current!;
    const previous = document.activeElement as HTMLElement | null;
    element.showModal();
    element.querySelector<HTMLInputElement>("input:checked:not(:disabled)")?.focus();
    return () => { element.close(); previous?.focus(); };
  }, []);
  return <dialog ref={dialog} className={styles.dialog} aria-labelledby={title}
    onCancel={event => { event.preventDefault(); onClose(); }}
    onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <h2 id={title}>Choose a Card Back</h2>
    {children}
    <div className={styles.dialogActions}><Button name="Close" onClick={onClose} /></div>
  </dialog>;
}
