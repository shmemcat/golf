import { useState, type CSSProperties } from "react";
import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faRobot } from "@fortawesome/pro-solid-svg-icons/faRobot";
import { faUser } from "@fortawesome/pro-solid-svg-icons/faUser";
import { Navbar } from "@/components/Navbar";
import { Card } from "@/components/Card";
import { BOT_NAMES } from "@/game/seats";
import { LAYOUT_IDEAS, previewLayout, type LayoutId, type PreviewCount } from "@/game/layoutPreviews";
import type { Rank, Suit } from "@/game/engine";
import "@/styles/game-board.css";
import "@/styles/card-selection.css";
import "@/styles/table-layouts.css";

const HANDS: (readonly [Rank, Suit] | null)[][] = [
  [null, ["8", "H"], null, null, null, ["J", "S"]],
  [null, null, ["3", "D"], null, ["8", "S"], null],
  [null, null, null, null, ["6", "H"], ["2", "H"]],
  [null, null, null, ["4", "S"], null, ["3", "S"]],
  [null, null, ["K", "D"], ["6", "C"], null, null],
  [["6", "C"], ["5", "H"], null, null, null, null],
];
const seatName = (seat: number) => seat ? BOT_NAMES[seat - 1] : "You";

function MiniBoard({ count, id }: { count: PreviewCount; id: LayoutId }) {
  const model = previewLayout(count, id, 1000);
  return <svg viewBox={`0 -145 1000 ${model.height + 145}`} className="layout-mini" aria-hidden="true">
    <line x1="30" y1="-12" x2="970" y2="-12" className="layout-mini-divider" />
    {[id === "header" ? 383 : 427, id === "header" ? 471 : 515].map((x, i) =>
      <rect key={x} x={x} y="-128" width="58" height="81" rx="7" className={i ? "layout-mini-front" : "layout-mini-back"} />)}
    {model.seats.map(seat => <g key={seat.seat}>
      {Array.from({ length: 6 }, (_, i) => <rect key={i}
        x={seat.x - seat.width / 2 + (i % 3) * (seat.cardWidth + (seat.seat ? 8 : 10))}
        y={seat.y + Math.floor(i / 3) * (seat.cardWidth * 1.4 + (seat.seat ? 8 : 14))}
        width={seat.cardWidth} height={seat.cardWidth * 1.4} rx="6"
        className={seat.seat ? "layout-mini-back" : "layout-mini-human"} />)}
      {seat.seat === 0 && <text x={seat.x} y={id === "below" ? model.height - 20 : seat.y + seat.height + 43} textAnchor="middle">You</text>}
    </g>)}
    <rect x={model.drawn.x - 5} y={model.drawn.y - 5} width={model.drawn.width + 10} height={model.drawn.height + 10} rx="10" className="layout-mini-draw-backing" />
    <rect x={model.drawn.x} y={model.drawn.y} width={model.drawn.width} height={model.drawn.height} rx="7" className="layout-mini-front" />
    <text x={model.drawn.x + model.drawn.width / 2} y={model.drawn.y + model.drawn.height * .62} textAnchor="middle" className="layout-mini-q">Q</text>
  </svg>;
}

function PreviewBoard({ count, id, width, actor }: { count: PreviewCount; id: LayoutId; width: number; actor: number }) {
  const model = previewLayout(count, id, width, actor);
  const headerDraw = id === "header";
  return <div className="layout-board" style={{ width }} data-selection-style="backing" aria-label={`${count}-player ${LAYOUT_IDEAS.find(idea => idea.id === id)!.title[count]} preview`}>
    <header className="layout-board-header">
      <span className="golf-info-pill">Hole 1 <span>/ 9</span></span>
      <div className={`layout-piles ${headerDraw ? "layout-piles-three" : ""}`}>
        <div className="golf-pile"><div className="golf-pile-button golf-deck"><span className="golf-deck-cards"><Card /></span></div><span>Deck <span className="golf-deck-count">64</span></span></div>
        <div className="golf-pile"><div className="golf-pile-button"><Card rank="10" suit="C" /></div><span>Discard</span></div>
        {headerDraw && <div className="layout-header-placeholder" aria-hidden="true" />}
      </div>
      <span className="layout-preview-label">Layout study</span>
    </header>
    <div className="layout-field" style={{ height: model.height }}>
      {model.seats.map(seat => <section key={seat.seat}
        className={`golf-seat layout-seat ${seat.seat === 0 ? "golf-seat-human" : ""}`}
        data-preview-seat={seat.seat} data-label={seat.label}
        aria-label={seat.seat === 0 ? "Your board" : `${seatName(seat.seat)}’s board`}
        style={{ left: seat.x - seat.width / 2, top: seat.y, "--card-width": `${seat.cardWidth}px` } as CSSProperties}>
        <div className="golf-seat-marker layout-name" data-active={actor === seat.seat} style={id === "below" && seat.seat === 0 ? { top: model.height - 51 - seat.y, bottom: "auto" } : undefined}>
          <span className="golf-turn-indicator" aria-hidden="true" />
          <span className="golf-seat-name"><FontAwesomeIcon icon={seat.seat ? faRobot : faUser} /><span>{seatName(seat.seat)}</span></span>
          <span className="golf-seat-score">0 <span>points</span></span>
        </div>
        <div className="golf-tableau">
          {HANDS[seat.seat].map((card, i) => <div key={i} className={`layout-card golf-selection ${actor === 0 && seat.seat === 0 ? "layout-card-valid" : ""}`}>
            <Card rank={card?.[0]} suit={card?.[1]} />
            {actor === 0 && seat.seat === 0 && <span className="golf-selection-indicator" />}
          </div>)}
        </div>
      </section>)}
      <p className="layout-phase-hint" style={{ top: model.hintY, width: actor ? 240 : 410 }}>{actor ? `${seatName(actor)} is choosing a card.` : "Replace a card, or click the draw to discard."}</p>
      <div className="layout-drawn" data-preview-drawn style={{ left: model.drawn.x, top: model.drawn.y, "--card-width": `${model.drawn.width}px` } as CSSProperties}>
        <div className="layout-card golf-selection"><Card rank="Q" suit="C" />{actor === 0 && <span className="golf-selection-indicator" />}</div>
        <span>{headerDraw ? "Drawn" : actor ? `${seatName(actor)} drew` : "Drawn card"}</span>
      </div>
    </div>
  </div>;
}

export default function TableLayouts() {
  const [count, setCount] = useState<PreviewCount>(5);
  const [selected, setSelected] = useState<LayoutId>("raised");
  const [width, setWidth] = useState(1000);
  const [opponentDraw, setOpponentDraw] = useState(false);
  const idea = LAYOUT_IDEAS.find(item => item.id === selected)!;
  return <div className="layout-page">
    <Helmet><title>Golf Table Layout Ideas</title></Helmet>
    <Navbar />
    <main id="page-content">
      <div className="layout-page-heading"><div><span className="layout-eyebrow">Desktop table studies</span><h1>Find room for the draw.</h1><p>Five ideas for each table size. You always sit at bottom center.</p></div><Link to={`/game/single?players=${count}`}>Play the {count}-player table →</Link></div>
      <div className="layout-controls">
        <div className="layout-count" role="group" aria-label="Number of players">{([5, 6] as const).map(n => <button key={n} type="button" aria-pressed={count === n} onClick={() => setCount(n)}>{n} players</button>)}</div>
        <label className="layout-width"><span>Table width <output>{width}px</output></span><input aria-label="Table width" type="range" min="760" max="1120" step="10" value={width} onChange={event => setWidth(Number(event.target.value))} /></label>
        <div className="layout-presets" role="group" aria-label="Width presets">{[780, 900, 1040].map(w => <button key={w} type="button" aria-pressed={width === w} onClick={() => setWidth(w)}>{w}px</button>)}</div>
        <label className="layout-actor"><input type="checkbox" checked={opponentDraw} onChange={event => setOpponentDraw(event.target.checked)} /> Show an opponent drawing</label>
      </div>
      <div className="layout-options" role="group" aria-label={`${count}-player layout ideas`}>
        {LAYOUT_IDEAS.map(item => <button key={item.id} type="button" className="layout-option" aria-pressed={selected === item.id} aria-label={`${item.letter}: ${item.title[count]}`} onClick={() => setSelected(item.id)}>
          <span className="layout-option-title"><b>{item.letter}</b><span>{item.title[count]}</span></span><MiniBoard count={count} id={item.id} /><span className="layout-option-position">{item.id === "header" ? "Draw near the piles" : item.id === "center" ? "Draw above your cards" : item.id === "below" ? "Draw below your cards" : "Draw beside your cards"}</span>
        </button>)}
      </div>
      <section className="layout-detail" aria-labelledby="layout-detail-title">
        <div className="layout-detail-heading"><div><h2 id="layout-detail-title">{idea.letter} · {idea.title[count]}</h2><p>{idea.benefit}</p></div><p className="layout-tradeoff">{idea.tradeoff[count]}</p></div>
        <div className="layout-board-scroll"><PreviewBoard count={count} id={selected} width={width} actor={opponentDraw ? count - 1 : 0} /></div>
      </section>
      <p className="layout-footnote">A is now live on the five- and six-player tables. The other studies remain available for comparison.</p>
    </main>
  </div>;
}
