import { useEffect, useRef, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { Navbar } from "@/components/Navbar";
import { asset } from "@/lib/assets";
import { BOT_NAMES } from "@/game/seats";
import type { DrawLayout } from "./GamePage";
import "@/styles/mobile-layouts.css";

export default function MobileLayouts() {
  const [count, setCount] = useState(3);
  const [layout, setLayout] = useState<DrawLayout>("beside");
  const [drawn, setDrawn] = useState(false);
  const [playable, setPlayable] = useState(false);
  const [selectedActor, setSelectedActor] = useState(0);
  const [replay, setReplay] = useState(0);
  const actor = Math.min(selectedActor, count - 1);
  // Match the supplied phone screenshot's proportions, reserving Chrome's bar.
  // This is a debugging viewport, not the phone panel's physical pixel count.
  const [width, setWidth] = useState(412);
  const [height, setHeight] = useState(748);
  const phone = useRef<HTMLIFrameElement>(null);
  const [overflow, setOverflow] = useState<number | null>(null);
  const gamePath = `game/single?players=${count}`;
  const previewPath = `game/mobile-preview?players=${count}&drawLayout=${layout}&drawn=${Number(drawn)}&actor=${actor}&replay=${replay}`;
  useEffect(() => {
    const frame = phone.current;
    if (!frame) return;
    let observer: ResizeObserver | undefined;
    const connect = () => {
      observer?.disconnect();
      const doc = frame.contentDocument;
      if (!doc?.body) return;
      const measure = () => {
        const visibleBottom = Math.max(0, ...Array.from(doc.querySelectorAll(".golf-seat:not([data-offscreen='true']) .golf-tableau, .golf-drawn-dock[data-visible='true'], .golf-tableau-controls"), el => el.getBoundingClientRect().bottom));
        setOverflow(Math.max(0, Math.ceil(Math.max(doc.documentElement.scrollHeight, visibleBottom + 8) - frame.clientHeight)));
      };
      observer = new ResizeObserver(measure);
      observer.observe(doc.body);
      doc.querySelectorAll(".golf-game-shell, .golf-mobile-status, .golf-table-scroll, .golf-overview-draw-shelf, .golf-tableau-controls").forEach(el => observer?.observe(el));
      measure();
    };
    frame.addEventListener("load", connect);
    connect();
    return () => { frame.removeEventListener("load", connect); observer?.disconnect(); };
  }, [count, layout, width, height, drawn, playable, actor, replay]);
  return <div className="mobile-layout-page">
    <Helmet><title>Mobile table · Golf</title></Helmet>
    <Navbar />
    <main id="page-content" className="mobile-layout-study">
      <div className="mobile-study-controls">
        <span className="mobile-study-eyebrow">S24 Ultra · portrait</span>
        <h1>A little room to play.</h1>
        <p>Keep your board centered. Compare three places for the drawn card, with or without a draw.</p>
        <fieldset><legend>Players</legend><div className="mobile-study-options">
          {[2, 3, 4, 5, 6].map(n => <button key={n} type="button" aria-pressed={count === n} onClick={() => setCount(n)}>{n}</button>)}
        </div></fieldset>
        {count <= 3 && !playable && <fieldset><legend>Draw placement</legend><div className="mobile-study-options">
          {([['beside', 'A · Beside the board'], ['below', 'B · Below the board'], ['piles', 'C · With the piles']] as const).map(([value, title]) =>
            <button key={value} type="button" aria-pressed={layout === value} onClick={() => setLayout(value)}>{title}</button>)}
        </div></fieldset>}
        {!playable && <fieldset><legend>Drawing player</legend><div className="mobile-study-options">
          {Array.from({ length: count }, (_, seat) => <button key={seat} type="button" aria-pressed={actor === seat}
            onClick={() => { setSelectedActor(seat); setDrawn(true); setReplay(0); }}>{seat === 0 ? "You" : BOT_NAMES[seat - 1]}</button>)}
        </div></fieldset>}
        <div className="mobile-study-toggles">
          <label><input type="checkbox" checked={drawn} disabled={playable} onChange={e => { setDrawn(e.target.checked); setReplay(0); }} /> Show a drawn card</label>
          <label><input type="checkbox" checked={playable} onChange={e => setPlayable(e.target.checked)} /> Play in the preview</label>
        </div>
        {!playable && <div className="mobile-study-options mobile-study-replay"><button type="button" onClick={() => { setDrawn(true); setReplay(value => value + 1); }}>Replay draw</button></div>}
        <div className="mobile-study-size">
          <label>Usable width<input type="number" aria-label="Usable viewport width" min="320" max="500" value={width} onChange={e => setWidth(Math.max(320, Math.min(500, Number(e.target.value))))} /></label>
          <span>×</span>
          <label>Usable height<input type="number" aria-label="Usable viewport height" min="550" max="1000" value={height} onChange={e => setHeight(Math.max(550, Math.min(1000, Number(e.target.value))))} /></label>
        </div>
        <p className="mobile-study-note">Starting at 412 × 748 CSS pixels, with Chrome’s address bar reserved from your screenshot. Adjust these if your display zoom leaves a different usable area.</p>
        {overflow !== null && <p className="mobile-study-fit" role="status">{overflow > 1 ? `Needs ${overflow}px of vertical scrolling` : "Fits in the usable screen"}</p>}
        <p className="mobile-study-decision"><strong>{count <= 3 ? "Keep the whole table." : "Give each player room."}</strong><br />{playable && count <= 3
          ? "The approved mobile table: centered boards, your draw beside you, and opponents’ draws below in a three-player game."
          : count <= 3
          ? layout === "beside" ? "A · The six cards stay centered. The draw sits to their right, with no movement when it appears."
            : layout === "below" ? "B · A centered draw below both boards. The cards are a little smaller to make room."
            : "C · A third slot with deck and discard. Both boards stay centered and have more space between them."
          : "Four to six use a cycled board, with a full-size draw underneath. The circles and auto-follow stay at the bottom."}</p>
        <p>{playable ? "The preview is a live game." : "Layout study with the same cards in every option. Open a table or enable play to try it."}</p>
        <Link to={`/${gamePath}`}>Open this table →</Link>
      </div>
      <div className="mobile-study-phone-wrap">
        <div className="mobile-study-phone" style={{ width }}>
          <div className="mobile-study-browser" aria-hidden="true"><span>Golf</span><span>cards.shmem.dev/golf</span><span>⋮</span></div>
          <iframe ref={phone} key={`${count}-${layout}-${drawn}-${playable}-${actor}-${replay}`} title={`${count}-player mobile Golf preview`} src={asset(playable ? gamePath : previewPath)} style={{ width, height }} />
        </div>
        <p>{width} × {height} usable · {count >= 4 ? "Cycled board" : "Whole table"}</p>
      </div>
    </main>
  </div>;
}
