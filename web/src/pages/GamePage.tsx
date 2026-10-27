import { useTurnIndicator } from "@/context/TurnSoundContext";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Helmet } from "react-helmet-async";
import { useNavigate, useSearchParams } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faRobot } from "@fortawesome/pro-solid-svg-icons/faRobot";
import { faListUl } from "@fortawesome/pro-solid-svg-icons/faListUl";
import { faChevronLeft } from "@fortawesome/pro-solid-svg-icons/faChevronLeft";
import { faChevronRight } from "@fortawesome/pro-solid-svg-icons/faChevronRight";
import { faCheck } from "@fortawesome/pro-solid-svg-icons/faCheck";
import { faFlag } from "@fortawesome/pro-solid-svg-icons/faFlag";
import { faEye } from "@fortawesome/pro-solid-svg-icons/faEye";
import { faEyeSlash } from "@fortawesome/pro-solid-svg-icons/faEyeSlash";
import { Navbar } from "@/components/Navbar";
import { Button } from "@/components/Buttons";
import { Card } from "@/components/Card";
import { ProfileIcon } from "@/components/ProfileIcon";
import { FlipCard } from "@/components/game/FlipCard";
import { CardFlight } from "@/components/game/CardFlight";
import { FadingIndicator } from "@/components/game/FadingIndicator";
import { GoingOutNotice } from "@/components/game/GoingOutNotice";
import { GameOverBlock } from "@/components/game/GameOverBlock";
import { PenaltyBanner } from "@/components/game/PenaltyBanner";
import { HoleRecordDialog } from "@/components/game/HoleRecordDialog";
import { useAuth } from "@/context/AuthContext";
import { useSound } from "@/context/SoundContext";
import { FLIP_MS, useGolfTable } from "@/hooks/useGolfTable";
import { useInactivityNudge } from "@/hooks/useInactivityNudge";
import { useGameResults } from "@/hooks/useGameResults";
import { seatOffset, useTableauNavigation } from "@/hooks/useTableauNavigation";
import { canOpen, completedHoleRecords, type GolfCard } from "@/game/engine";
import { BOT_NAMES, SEAT_LAYOUTS } from "@/game/seats";
import { readStorage } from "@/lib/storage";
import { readLocalGame } from "@/lib/localGame";
import { selectionStyle, type SelectionStyle } from "@/game/selectionStyles";
import type { Participant } from "@/lib/golfApi";
import { ServerBotGame } from "./OnlineGame";
import "@/styles/game-board.css";
import "@/styles/card-selection.css";
import "@/styles/mobile-table.css";

const describeCard = (card: GolfCard) => `${card.rank} of ${{ S: "spades", H: "hearts", C: "clubs", D: "diamonds" }[card.suit]}`;
const location = (index: number) => `${index < 3 ? "top" : "bottom"} row, column ${index % 3 + 1}`;
const BOARD_REVIEW_MS = 4000;
const SCORE_POP_BEAT_MS = 250;
export type DrawLayout = "beside" | "below" | "piles";
export const drawLayoutFrom = (value: string | null): DrawLayout => value === "below" || value === "piles" ? value : "beside";

export function GolfTableView({ count, selection, table, drawLayout = "beside", resultNotice, participants, rematchWaiting = false, onLeave, connectionNotice, multiplayer = false, isHost = true, disconnected = false, pending = false, onOpenHoleRecord, previewHideResults = false }: {
  count: number; selection: SelectionStyle; table: ReturnType<typeof useGolfTable>; drawLayout?: DrawLayout; resultNotice?: ReactNode;
  multiplayer?: boolean; isHost?: boolean; disconnected?: boolean; pending?: boolean;
  participants?: Participant[]; rematchWaiting?: boolean; onLeave?: () => void; connectionNotice?: ReactNode;
  onOpenHoleRecord?: () => void; previewHideResults?: boolean;
}) {
  const { game, stage, motion } = table;
  const { user } = useAuth();
  const { play } = useSound();
  const sound = useRef(play);
  sound.current = play;
  const navigate = useNavigate();
  const board = useRef<HTMLDivElement>(null);
  const summary = useRef<HTMLDialogElement>(null);
  const resultsToggle = useRef<HTMLButtonElement>(null);
  const matchInfo = useRef<HTMLDetailsElement>(null);
  const name = (seat: number) => participants?.[seat]?.name || (seat === 0 ? user?.name || "You" : BOT_NAMES[seat - 1]);
  const isBot = (seat: number) => participants ? participants[seat].isBot : seat !== 0;
  const icon = (seat: number) => participants?.[seat]?.profileIcon || (seat === 0 ? user?.profile_icon : undefined);
  const cardBackFor = (seat: number) => !multiplayer || seat === 0 ? undefined : participants?.[seat]?.cardBack ?? "argyle";
  const roundComplete = game.phase === "round-over";
  const complete = roundComplete || game.phase === "game-over";
  const completedHole = complete ? `${game.id}:${game.hole}` : null;
  const [recordGame, setRecordGame] = useState<string | null>(null);
  const recordOpen = recordGame === game.id;
  const records = completedHoleRecords(game).map(record => ({ ...record,
    players: record.players.map((player, seat) => ({ ...player,
      name: player.name ?? name(seat), isBot: player.isBot ?? isBot(seat), icon: player.icon ?? icon(seat),
    })),
  }));
  const [reviewedHole, setReviewedHole] = useState<string | null>(null);
  const [scorePopHole, setScorePopHole] = useState<string | null>(null);
  const [hiddenResultsHole, setHiddenResultsHole] = useState<string | null>(() => previewHideResults ? completedHole : null);
  const showResults = complete && reviewedHole === completedHole;
  const resultsHidden = completedHole !== null && hiddenResultsHole === completedHole;
  const showHoleScores = complete && scorePopHole === completedHole;
  const nudge = useInactivityNudge(multiplayer && !disconnected && !pending && (
    table.canDraw || table.canReplace || Array.from({ length: 6 }, (_, index) => table.canReveal(index)).some(Boolean) ||
    (roundComplete && showResults)
  ), `${game.id}:${game.hole}:${stage}:${game.phase}:${game.turn}:${game.players[0].cards.filter(c => c.faceUp).length}`);
  const openingTurn = stage === "opening";
  useTurnIndicator(!disconnected && !pending && (openingTurn
    ? Array.from({ length: 6 }, (_, index) => table.canReveal(index)).some(Boolean)
    : table.canDraw), openingTurn ? `${game.id}:${game.hole}:opening` :
      `${game.id}:${game.hole}:${game.deck.length}:${game.discard.map(card => card.id).join(",")}:${game.players.flatMap(player => player.cards.map(cell => cell.card.id + cell.faceUp)).join(",")}`);
  const holeScores = game.history[game.history.length - 1];
  const standings = game.players.map((player, seat) => ({ seat, score: player.score }))
    .sort((a, b) => a.score - b.score);
  const wentOut = (game.turn + 1) % count;
  // The final player in the queue always sits immediately before whoever went out.
  const goingOutSeat = game.finalTurns?.length ? (game.finalTurns[game.finalTurns.length - 1] + 1) % count : -1;
  const navigation = useTableauNavigation(count,
    stage === "playing" ? game.turn : stage === "announcing" ? game.starter : 0);
  const { mobile, cycled, viewedSeat, following } = navigation;
  useLayoutEffect(() => {
    if (mobile) return;
    const table = board.current?.querySelector<HTMLElement>(".golf-table");
    const hint = table?.querySelector<HTMLElement>(".golf-phase-hint");
    const human = table?.querySelector<HTMLElement>(".golf-seat-human");
    const opponents = table?.querySelectorAll<HTMLElement>('.golf-seat[data-position^="top"]');
    if (!table || !hint || !human || !opponents?.length) return;

    const centerHint = () => {
      const upperEdge = Math.max(...Array.from(opponents, seat => seat.getBoundingClientRect().bottom));
      const lowerEdge = human.getBoundingClientRect().top;
      hint.style.setProperty("--golf-hint-offset", `${(lowerEdge - upperEdge) / 2}px`);
    };
    centerHint();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(centerHint);
    [table, human, ...opponents].forEach(element => observer.observe(element));
    return () => observer.disconnect();
  }, [mobile, count, game.hole]);
  const humanVisible = !cycled || viewedSeat === 0;
  const canDraw = table.canDraw && humanVisible;
  const sharedDraw = mobile && !cycled && drawLayout !== "beside";
  useEffect(() => {
    const closeOutside = (event: MouseEvent) => {
      const info = matchInfo.current;
      if (info?.open && !info.contains(event.target as Node)) info.open = false;
    };
    document.addEventListener("click", closeOutside, true);
    return () => document.removeEventListener("click", closeOutside, true);
  }, []);
  useEffect(() => {
    if (!completedHole) {
      setReviewedHole(null);
      setScorePopHole(null);
      setHiddenResultsHole(null);
      return;
    }
    const pop = window.setTimeout(() => {
      setScorePopHole(completedHole);
      sound.current("pop");
    }, FLIP_MS + SCORE_POP_BEAT_MS);
    // Let the last hidden cards finish flipping, then hold the exposed board.
    const timer = window.setTimeout(() => setReviewedHole(completedHole), FLIP_MS + BOARD_REVIEW_MS);
    return () => { window.clearTimeout(pop); window.clearTimeout(timer); };
  }, [completedHole]);
  useEffect(() => {
    if (!showResults || recordOpen) return;
    if (resultsHidden) {
      resultsToggle.current?.focus({ preventScroll: true });
      return;
    }
    if (!roundComplete) return;
    const dialog = summary.current;
    if (!dialog) return;
    dialog.showModal();
    dialog.querySelector("button")?.focus();
    return () => dialog.close();
  }, [roundComplete, showResults, resultsHidden, recordOpen]);

  let hint = "Dealing your cards…";
  if (stage === "opening") hint = game.players[0].cards.filter(card => card.faceUp).length >= 2 ? "Waiting for everyone’s starting cards…" : game.players[0].cards.some(card => card.faceUp)
    ? `Flip a card in the ${game.players[0].cards.slice(0, 3).some(card => card.faceUp) ? "bottom" : "top"} row and a different column.`
    : "Flip one top card and one bottom card, in different columns.";
  if (stage === "opponents") hint = "Everyone turns over their starting cards.";
  if (stage === "upcard") hint = "Turning up the first discard…";
  if (stage === "picking") hint = "Choosing who goes first…";
  if (stage === "announcing") hint = game.starter === 0 ? "You go first!" : `${name(game.starter)} goes first!`;
  if (stage === "playing") {
    if (motion) hint = `${motion.seat ? `${name(motion.seat)} is` : "You are"} ${motion.kind === "draw" ? "drawing a card" : motion.kind === "toss" ? "discarding the draw" : "swapping cards"}…`;
    else if (complete) hint = "All cards revealed. Pink outlines mark the last hidden cards.";
    else if (game.turn !== 0) hint = `${name(game.turn)} is ${game.phase === "draw" ? "drawing" : "choosing a card"}…`;
    else hint = game.phase === "draw" ? mobile ? "Your turn. Draw from either pile." : "Your turn. Draw from the deck or discard pile."
      : game.drawn?.source === "deck" ? "Replace a card, or tap the draw to discard." : "Choose a card on your board to replace.";
  }
  const activeSeat = stage === "picking" ? table.pickerSeat : stage === "announcing" ? game.starter :
    stage === "playing" && !complete ? game.turn : -1;
  const nextSeat = stage === "playing" && !complete ? game.finalTurns
    ? game.finalTurns.find(seat => seat !== game.turn) ?? -1 : (game.turn + 1) % count : -1;
  const needOwnCards = cycled && viewedSeat !== 0 && (stage === "opening" || (stage === "playing" && game.turn === 0 && !complete));
  let discard = game.discard[game.discard.length - 1];
  if (motion?.kind === "draw" && motion.source === "discard") discard = game.discard[game.discard.length - 2];
  if (motion?.kind === "place") discard = game.players[motion.seat].cards[motion.index].card;

  const holeScore = (seat: number) => {
    const score = holeScores?.[seat];
    if (!showHoleScores || score === undefined) return null;
    return <strong key={completedHole} className="golf-hole-score" data-went-out={seat === wentOut}
      aria-label={`${name(seat)} scored ${score} this hole${seat === wentOut ? ", went out first" : ""}`}>
      {score >= 0 ? `+${score}` : `−${Math.abs(score)}`}
    </strong>;
  };

  const drawnDock = (seat: number, shared = false) => {
    const showScore = mobile && showHoleScores && !shared && holeScores?.[seat] !== undefined;
    const visible = showScore || shared || (game.turn === seat && !!game.drawn) || (motion?.kind === "draw" && motion.seat === seat);
    return <div className={`golf-drawn-dock ${shared ? "golf-shared-draw" : ""}`} data-visible={visible} data-score={showScore} aria-hidden={!visible}>
      <div className="golf-drawn-card" data-anchor={`drawn-${seat}`} data-hidden={["place", "toss"].includes(motion?.kind ?? "")}>
        {showScore ? holeScore(seat) : game.turn === seat && game.drawn ? seat === 0 ? (
          <button type="button" className="golf-drawn-button golf-selection"
            disabled={!table.canReplace || game.drawn.source !== "deck"}
            data-valid={table.canReplace && game.drawn.source === "deck"}
            aria-label={game.drawn.source === "deck" ? `Discard drawn ${describeCard(game.drawn.card)}`
              : `Drawn ${describeCard(game.drawn.card)}, choose a board card to replace`}
            onClick={table.toss}>
            <FlipCard key={game.drawn.card.id} card={game.drawn.card} faceUp ownerBack={cardBackFor(seat)} />
            <FadingIndicator active={table.canReplace && game.drawn.source === "deck"} className="golf-selection-indicator" />
          </button>
        ) : <div role="img" aria-label={`Drawn card: ${describeCard(game.drawn.card)}`}><FlipCard key={game.drawn.card.id} card={game.drawn.card} faceUp ownerBack={cardBackFor(seat)} /></div>
          : shared && <span className="golf-empty-pile" />}
      </div>
      <span>Drawn card</span>
    </div>;
  };

  const resultsLabel = `${resultsHidden ? "Show" : "Hide"} ${roundComplete ? "hole" : "game"} results`;
  const resultsButton = <button ref={resultsToggle} type="button" className="golf-results-toggle"
    aria-label={resultsLabel} title={resultsLabel}
    aria-expanded={!resultsHidden} aria-controls={roundComplete ? "golf-hole-results" : "golf-game-results"}
    onClick={() => setHiddenResultsHole(resultsHidden ? null : completedHole)}>
    <FontAwesomeIcon icon={resultsHidden ? faEye : faEyeSlash} />
  </button>;

  return (
    <div className={`golf-game-shell${nudge.shaking ? " inactivity-shake" : ""}`} onPointerDown={nudge.reset} onKeyDown={nudge.reset} ref={board} data-selection-style={selection} data-mobile-layout={mobile ? cycled ? "cycle" : "overview" : undefined} data-draw-layout={drawLayout}
      style={{ "--golf-flip-duration": `${FLIP_MS}ms` } as React.CSSProperties}>
      <Navbar />
      {connectionNotice}
      <main id="page-content" className="golf-game" tabIndex={-1} aria-label={`${count}-player Golf table`}>
        <GoingOutNotice holeKey={`${game.id}:${game.hole}`} finalTurns={game.finalTurns !== null}
          playerName={goingOutSeat >= 0 ? name(goingOutSeat) : ""} />
        <header className="golf-table-header">
          <div className="golf-match-status">
            <button type="button" className="golf-info-pill golf-hole-record-trigger"
              aria-label={`Hole ${game.hole} of 9. View hole record`} aria-haspopup="dialog" onClick={() => {
                if (complete) setHiddenResultsHole(completedHole);
                if (onOpenHoleRecord) onOpenHoleRecord();
                else setRecordGame(game.id);
              }}>
              Hole {game.hole} <span>/ 9</span>
            </button>
            <FadingIndicator active={!!game.finalTurns && !complete} className="golf-final-turns">Final turns</FadingIndicator>
          </div>
          <div className="golf-piles" role="group" aria-label="Draw piles">
            <div className="golf-pile">
              <button type="button" className="golf-pile-button golf-deck golf-selection" data-anchor="deck"
                data-valid={canDraw} disabled={!canDraw || !game.deck.length}
                aria-label={`Draw from deck, ${game.deck.length} cards`} onClick={() => table.draw("deck")}>
                <span className="golf-deck-cards" aria-hidden="true"><Card /></span>
                <FadingIndicator active={canDraw && !!game.deck.length} className="golf-selection-indicator" />
              </button>
              <span>Deck <span className="golf-deck-count">{game.deck.length}</span></span>
            </div>
            <div className="golf-pile">
              <button type="button" className="golf-pile-button golf-selection" data-anchor="discard"
                data-valid={canDraw && !!discard} disabled={!canDraw || !discard}
                aria-label={discard ? `Draw ${describeCard(discard)} from discard` : "Discard pile, empty"}
                onClick={() => table.draw("discard")}>
                {discard ? <Card rank={discard.rank} suit={discard.suit} /> : <span className="golf-empty-pile" />}
                <FadingIndicator active={canDraw && !!discard} className="golf-selection-indicator" />
              </button>
              <span>Discard</span>
            </div>
            {sharedDraw && !complete && drawLayout === "piles" && drawnDock(game.turn, true)}
          </div>
          <details className="golf-match-info" ref={matchInfo}>
            <summary aria-label="Game information and scorecard"><FontAwesomeIcon icon={faListUl} /></summary>
            <div className="golf-match-panel">
              <h2>Scorecard</h2>
              <ol>{game.players.map((player, seat) => <li key={seat}><span>{name(seat)}</span><strong>{player.score}</strong></li>)}</ol>
              <hr />
              <Button name="Leave table" size="compact" className="golf-leave-table" onClick={onLeave ?? (() => navigate("/play"))} />
            </div>
          </details>
        </header>
        {mobile && <div className="golf-mobile-status">
          <p className="golf-mobile-hint" role="status" aria-label="Turn" aria-live="polite" aria-atomic="true">{hint}</p>
          <div className="golf-turn-preview">
            {nextSeat >= 0 && <span>Up next: <strong>{name(nextSeat)}</strong></span>}
            {needOwnCards && <button type="button" onClick={() => navigation.view(0)}>Back to my board</button>}
          </div>
        </div>}
        <div className="golf-table-scroll" data-cycled={cycled}>
          {cycled && <span key={`${game.hole}-${activeSeat}`} className="golf-turn-edge" data-pulse={stage === "playing" && !complete} aria-hidden="true" />}
          <div className="golf-table-viewport" role={cycled ? "region" : undefined}
            aria-label={cycled ? "Player boards. Swipe or use arrow keys to browse." : undefined}
            aria-roledescription={cycled ? "carousel" : undefined} tabIndex={cycled ? 0 : undefined}
            {...(cycled ? navigation.swipe : {})}>
          <div key={game.hole} className="golf-table" data-players={count} data-stage={stage} data-viewed-seat={viewedSeat} data-complete={complete}>
            {game.players.map((player, seat) => (
              <section key={seat} className={`golf-seat ${seat === 0 ? "golf-seat-human" : ""}`}
                data-offscreen={cycled && seat !== viewedSeat} aria-hidden={cycled && seat !== viewedSeat ? true : undefined}
                ref={node => { if (node) node.inert = cycled && seat !== viewedSeat; }}
                style={cycled ? { "--seat-offset": seatOffset(seat, viewedSeat, count) } as React.CSSProperties : undefined}
                data-seat={seat} data-position={SEAT_LAYOUTS[count][seat]} aria-label={seat === 0 ? "Your board" : `${name(seat)}’s board`}>
                <div className="golf-seat-marker" data-active={activeSeat === seat} aria-current={activeSeat === seat ? "step" : undefined}>
                  <span className="golf-turn-indicator" aria-hidden="true" />
                  <span className="golf-seat-name">
                    {isBot(seat) ? <FontAwesomeIcon icon={faRobot} /> : <ProfileIcon name={icon(seat)} />}
                    <span title={name(seat)}>{name(seat)}</span>
                    {seat === goingOutSeat && <small className="golf-going-out-flag" aria-label={`${name(seat)} went out`}>
                      <FontAwesomeIcon icon={faFlag} aria-hidden="true" /><span aria-hidden="true">Out</span>
                    </small>}
                  </span>
                  <span className="golf-seat-score">{player.score} <span>points</span></span>
                  {!mobile && holeScore(seat)}
                </div>
                {seat === 0 && !mobile && <p className="golf-phase-hint" role="status" aria-label="Turn" aria-live="polite" aria-atomic="true">{hint}</p>}
                <div className="golf-tableau">
                  {player.cards.map((cell, index) => {
                    const valid = seat === 0 && ((stage === "opening" && canOpen(game, index)) || table.canReplace);
                    const enabled = seat === 0 && (table.canReveal(index) || table.canReplace);
                    const hidden = motion?.seat === seat && motion.index === index && ["discard", "place"].includes(motion.kind);
                    const revealedAtEnd = complete && cell.revealedAtEnd === true;
                    const description = `${cell.faceUp ? describeCard(cell.card) : "face down"}${revealedAtEnd ? ", revealed at end of hole" : ""}`;
                    return (
                      <div className="golf-card-slot" data-anchor={`card-${seat}-${index}`} data-revealed-at-end={revealedAtEnd} key={index}
                        style={{ "--deal-delay": `${index * 45 + seat * 20}ms` } as React.CSSProperties}>
                        {seat === 0 ? (
                          <button type="button" className="golf-grid-card golf-selection" data-valid={valid} data-hidden={hidden}
                            disabled={!enabled} aria-label={`${stage === "opening" ? "Reveal" : "Replace"} ${location(index)}, ${description}`}
                            onClick={() => stage === "opening" ? table.reveal(index) : table.replace(index)}>
                            <FlipCard key={cell.card.id} card={cell.card} faceUp={cell.faceUp} ownerBack={cardBackFor(seat)} />
                            <FadingIndicator active={valid} className="golf-selection-indicator" />
                          </button>
                        ) : (
                          <div className="golf-grid-card" data-hidden={hidden} role="img" aria-label={`${location(index)}, ${description}`}>
                            <FlipCard key={cell.card.id} card={cell.card} faceUp={cell.faceUp} ownerBack={cardBackFor(seat)} />
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {(!sharedDraw || complete) && drawnDock(seat)}
                </div>
              </section>
            ))}
          </div>
          </div>
          {cycled && <>
            <button type="button" className="golf-tableau-arrow golf-tableau-previous" aria-label={`Previous board: ${name((viewedSeat + count - 1) % count)}`} onClick={() => navigation.move(-1)}><FontAwesomeIcon icon={faChevronLeft} /></button>
            <button type="button" className="golf-tableau-arrow golf-tableau-next" aria-label={`Next board: ${name((viewedSeat + 1) % count)}`} onClick={() => navigation.move(1)}><FontAwesomeIcon icon={faChevronRight} /></button>
          </>}
        </div>
        {sharedDraw && !complete && drawLayout === "below" && <div className="golf-overview-draw-shelf">{drawnDock(game.turn, true)}</div>}
        {cycled && <footer className="golf-tableau-controls">
          <div className="golf-tableau-pages" role="group" aria-label="Choose a player board">
            {game.players.map((_, seat) => <button key={seat} type="button" aria-label={`View ${seat ? `${name(seat)}’s` : "your"} board${activeSeat === seat ? ", current turn" : ""}${nextSeat === seat ? ", up next" : ""}`}
              aria-pressed={seat === viewedSeat} data-turn={activeSeat === seat} data-next={nextSeat === seat} onClick={() => navigation.view(seat)}><span /></button>)}
          </div>
          <span className="golf-tableau-caption">{viewedSeat === 0 ? "Your board" : `${name(viewedSeat)}’s board`} · {viewedSeat + 1} / {count}</span>
          <button type="button" className="golf-auto-follow" aria-pressed={following} onClick={navigation.toggleFollowing}>
            <span className="golf-follow-check"><FontAwesomeIcon icon={faCheck} /></span>
            <span>Auto-follow <small>{following ? "Following the turn" : "Paused · tap to resume"}</small></span>
          </button>
        </footer>}
      </main>
      {motion && <CardFlight key={`${motion.kind}-${motion.seat}-${motion.index}`} flight={motion} board={board} viewedSeat={cycled ? viewedSeat : undefined}
        ownerBack={motion.kind === "draw" || motion.kind === "upcard" ? undefined : cardBackFor(motion.seat)} />}
      {game.phase === "game-over" && showResults && !recordOpen && (resultsHidden ? resultsButton : <GameOverBlock
        players={game.players.map((player, seat) => ({
          name: name(seat), score: player.score, isBot: isBot(seat), icon: icon(seat),
        }))}
        onPlayAgain={table.restart}
        onLeaveLobby={multiplayer ? onLeave : undefined}
        leavePending={pending}
        waiting={rematchWaiting}
        waitingForHost={multiplayer && !isHost}
        penaltyNotice={<PenaltyBanner game={game} name={name} />}
        notice={resultNotice}
        visibilityToggle={resultsButton}
      />)}
      {roundComplete && showResults && (resultsHidden ? resultsButton : (
        <dialog ref={summary} id="golf-hole-results" className="golf-round-summary" aria-labelledby="golf-summary-title" onCancel={event => event.preventDefault()}>
          <h2 id="golf-summary-title">Hole {game.hole} complete</h2>
          <PenaltyBanner game={game} name={name} />
          <div className="golf-round-scores">
            <div className="golf-score-head"><span>Player</span><span>This hole</span><span>Total</span></div>
            {standings.map(({ seat, score }) => <div key={seat} data-current={seat === 0}><span>{name(seat)}</span><span>{holeScores[seat] >= 0 ? `+${holeScores[seat]}` : holeScores[seat]}</span><strong>{score}</strong></div>)}
          </div>
          <Button name="Next Hole" disabled={pending || disconnected} onClick={table.advance} />
          {connectionNotice}
          {resultsButton}
        </dialog>
      ))}
      {recordOpen && <HoleRecordDialog key={game.id} records={records} onClose={() => setRecordGame(null)} />}
    </div>
  );
}

function GolfTable({ count, selection }: { count: number; selection: SelectionStyle }) {
  const table = useGolfTable(count, true);
  const result = useGameResults(table.game);
  return <GolfTableView count={count} selection={selection} table={table}
    resultNotice={result.error && <p role="alert" className="inline-error">{result.error}{" "}<button type="button" className="link" onClick={result.retry}>Try again</button></p>} />;
}

export default function GamePage() {
  const { user, loading } = useAuth();
  const [params] = useSearchParams();
  const requested = Number(params.get("players") ?? readStorage("golf.players.v1", 2));
  const saved = !user && !params.get("room") ? readLocalGame() : null;
  const count = saved?.game.players.length ?? (Number.isInteger(requested) && requested >= 2 && requested <= 6 ? requested : 2);
  const selection = selectionStyle(params.get("selection"));
  if (loading) return <main className="loading-page" role="status">Loading your table…</main>;
  return <><Helmet><title>{`Play Golf · ${count} Players`}</title></Helmet>{user || params.get("room")
    ? <ServerBotGame count={count} selection={selection} /> : <GolfTable key={count} count={count} selection={selection} />}</>;
}
