import { useEffect, useRef, useState, type PointerEvent } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronLeft } from "@fortawesome/pro-solid-svg-icons/faChevronLeft";
import { faChevronRight } from "@fortawesome/pro-solid-svg-icons/faChevronRight";
import { faFlag } from "@fortawesome/pro-solid-svg-icons/faFlag";
import { faRobot } from "@fortawesome/pro-solid-svg-icons/faRobot";
import { Card } from "@/components/Card";
import { Button } from "@/components/Buttons";
import { ProfileIcon } from "@/components/ProfileIcon";
import type { GolfCard } from "@/game/engine";
import "@/styles/hole-record.css";

export interface HoleRecord {
  hole: number;
  wentOut: number | null;
  players: { name: string; isBot?: boolean; icon?: string; cards: GolfCard[]; score: number; penalty?: number }[];
}

const scoreLabel = (score: number) => score > 0 ? `+${score}` : score < 0 ? `−${Math.abs(score)}` : "0";

// Mount on opening so each visit starts at the most recently completed hole.
export function HoleRecordDialog({ records, onClose }: {
  records: HoleRecord[]; onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [index, setIndex] = useState(Math.max(0, records.length - 1));
  const gesture = useRef<{ x: number; y: number; id: number } | null>(null);
  const backdropPress = useRef(false);
  const record = records[index];
  const move = (direction: number) => setIndex(current => Math.max(0, Math.min(records.length - 1, current + direction)));

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    element.showModal();
    element.focus({ preventScroll: true });
    return () => {
      element.close();
      document.body.style.overflow = previousOverflow;
      trigger?.focus({ preventScroll: true });
    };
  }, []);

  const startSwipe = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || !event.isPrimary) return;
    gesture.current = { x: event.clientX, y: event.clientY, id: event.pointerId };
  };

  return <dialog ref={dialog} className="golf-hole-record" aria-labelledby="golf-record-title" tabIndex={-1}
    onCancel={event => { event.preventDefault(); onClose(); }}
    onPointerDown={event => { backdropPress.current = event.target === event.currentTarget; }}
    onClick={event => { if (backdropPress.current && event.target === event.currentTarget) onClose(); }}
    onKeyDown={event => {
      if (!record || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      if (event.key === "Home") setIndex(0);
      else if (event.key === "End") setIndex(records.length - 1);
      else move(event.key === "ArrowRight" ? 1 : -1);
    }}>
    <div className="golf-record-content">
      <header className="golf-record-header">
        <p className="golf-record-eyebrow">Hole record</p>
        <h2 id="golf-record-title" aria-live="polite" aria-atomic="true">{record ? <>Hole {record.hole} <span>/ 9</span></> : "Your round starts here"}</h2>
        {!record && <p className="golf-record-empty">Completed holes will appear here.</p>}
      </header>
      {record && <>
        <div className="golf-record-carousel" role="region" aria-roledescription="carousel" aria-label="Completed holes">
          <div className="golf-record-viewport" onPointerDown={startSwipe} onPointerCancel={() => { gesture.current = null; }}
            onPointerUp={event => {
              const start = gesture.current;
              gesture.current = null;
              if (!start || start.id !== event.pointerId) return;
              const dx = event.clientX - start.x;
              if (Math.abs(dx) >= 48 && Math.abs(dx) > Math.abs(event.clientY - start.y) * 1.5) move(dx < 0 ? 1 : -1);
            }}>
            <div className="golf-record-boards" data-players={record.players.length} key={record.hole} role="group" aria-roledescription="slide" aria-label={`Hole ${record.hole} final cards`}>
              {record.players.map((player, seat) => <section key={seat} className="golf-record-player" aria-label={player.name === "You" ? "Your final cards" : `${player.name}’s final cards`}>
                <div className="golf-record-player-heading">
                  <span className="golf-record-player-name">{player.isBot ? <FontAwesomeIcon icon={faRobot} /> : <ProfileIcon name={player.icon} />}<span>{player.name}</span></span>
                  <strong className="golf-record-score" data-under={player.score < 0} aria-label={`${player.score} points this hole`}>{scoreLabel(player.score)}</strong>
                </div>
                <div className="golf-record-hand">{player.cards.map(card => <Card key={card.id} rank={card.rank} suit={card.suit} />)}</div>
                <p className="golf-record-player-note">{seat === record.wentOut && <><FontAwesomeIcon icon={faFlag} /> Went out{player.penalty ? ` · +${player.penalty} penalty` : ""}</>}</p>
              </section>)}
            </div>
          </div>
          <button type="button" className="golf-tableau-arrow golf-tableau-previous" aria-label="Previous hole" disabled={index === 0} onClick={() => move(-1)}><FontAwesomeIcon icon={faChevronLeft} /></button>
          <button type="button" className="golf-tableau-arrow golf-tableau-next" aria-label="Next hole" disabled={index === records.length - 1} onClick={() => move(1)}><FontAwesomeIcon icon={faChevronRight} /></button>
        </div>
        <footer className="golf-record-navigation">
          <div className="golf-tableau-pages" role="group" aria-label="Choose a completed hole">
            {records.map((hole, page) => <button key={hole.hole} type="button" aria-label={`View hole ${hole.hole}`} aria-pressed={index === page} onClick={() => setIndex(page)}><span /></button>)}
          </div>
        </footer>
      </>}
      <Button name="Close" className="golf-record-close" onClick={onClose} />
    </div>
  </dialog>;
}
