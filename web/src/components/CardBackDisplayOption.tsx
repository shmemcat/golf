import { useId, useMemo } from "react";
import { Card } from "@/components/Card";
import { useCardBack } from "@/context/CardBackContext";
import { SELECTABLE_CARD_BACKS, type CardBackId } from "@/lib/cardBacks";
import styles from "@/styles/card-back-display-option.module.css";

export function CardBackDisplayOption() {
  const { cardBack, displayMode, chooseDisplay, saving, displaySaving, displayError, available } = useCardBack();
  const id = useId();
  const others = useMemo(() => {
    const alternatives: CardBackId[] = SELECTABLE_CARD_BACKS.filter(back => back.id !== cardBack).map(back => back.id);
    const takeRandom = () => alternatives.splice(Math.floor(Math.random() * alternatives.length), 1)[0];
    return [takeRandom(), takeRandom()];
  }, [cardBack]);
  const options = [
    { id: "uniform", title: "One design everywhere", description: "Use your card back throughout the site.", backs: [cardBack, cardBack, cardBack] },
    { id: "players", title: "Each player’s design", description: "Show the card back each player has chosen.", backs: [cardBack, ...others] },
  ] as const;
  return <section className={styles.section} data-design="tiles" aria-labelledby={`${id}-heading`}>
    <h2 id={`${id}-heading`}>Card Back Display</h2>
    <fieldset className={styles.choices} aria-label="How to display card backs" disabled={!available || saving} aria-busy={displaySaving}>
      {options.map(option => <label key={option.id} className={styles.choice} data-selected={displayMode === option.id}>
        <input type="radio" name={id} value={option.id} checked={displayMode === option.id}
          aria-labelledby={`${id}-${option.id}-title`} aria-describedby={`${id}-${option.id}-description`}
          onChange={async event => { const input = event.currentTarget; await chooseDisplay(option.id); if (input.isConnected) input.focus(); }} />
        <span className={styles.title} id={`${id}-${option.id}-title`}>
          {option.id === "players" ? <span>Each player’s <br />design</span> : option.title}
        </span>
        <span className={styles.miniBacks} aria-hidden="true">
          {option.backs.map((back, index) => <span className={styles.miniCard} key={index}><Card back={back} /></span>)}
        </span>
        <span className={styles.description} id={`${id}-${option.id}-description`}>{option.description}</span>
      </label>)}
    </fieldset>
    {displaySaving && <p className="sr-only" role="status">Saving card back display…</p>}
    {displayError && <p role="alert">{displayError}</p>}
  </section>;
}
