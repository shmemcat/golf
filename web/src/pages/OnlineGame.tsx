import { useEffect, useRef, useState } from "react";
import { Helmet } from "react-helmet-async";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Button, MenuLink } from "@/components/Buttons";
import { PageLayout } from "@/components/ui/PageLayout";
import { LobbyRoom, JoinLobby } from "@/components/LobbyRoom";
import { useGolfRoom } from "@/hooks/useGolfRoom";
import { useAuth } from "@/context/AuthContext";
import { useServerGolfTable } from "@/hooks/useServerGolfTable";
import { golfGet, golfPost, newRequestId, type RoomState } from "@/lib/golfApi";
import { selectionStyle, type SelectionStyle } from "@/game/selectionStyles";
import { GolfTableView } from "./GamePage";
import "@/styles/online.css";

export function ServerBotGame({ count, selection }: { count: number; selection: SelectionStyle }) {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const code = params.get("room")?.toUpperCase();
  const requestId = useRef(newRequestId());
  const [createdRoom, setCreatedRoom] = useState<RoomState | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (code) return;
    let alive = true;
    setError("");
    void (async () => {
      const { rooms } = await golfGet<{ rooms: RoomState[] }>("/active");
      if (!alive) return;
      if (rooms.length) { navigate("/play", { replace: true }); return; }
      const { state } = await golfPost<{ state: RoomState }>("/bots", { players: count, requestId: requestId.current });
      if (alive) {
        setCreatedRoom(state);
        setParams({ players: String(count), room: state.code }, { replace: true });
      }
    })().catch(e => { if (alive) setError(e.message); });
    return () => { alive = false; };
  }, [code, count, setParams, attempt, navigate]);
  return code ? <ConnectedGame key={code} code={code} selection={selection} initialState={createdRoom} botGame />
    : <BotTableLoading error={error} retry={() => setAttempt(n => n + 1)} />;
}

function BotTableLoading({ error, retry }: { error: string; retry: () => void }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setVisible(true), 250);
    return () => window.clearTimeout(timer);
  }, []);
  if (!error && !visible) return <main id="page-content" className="loading-page" aria-label="Preparing your table" aria-busy="true" />;
  return <PageLayout title="YOUR TABLE">
    {error ? <p role="alert">{error}</p> : <p role="status">Dealing your cards…</p>}
    <div className="button-stack">{error && <Button name="Try again" onClick={retry} />}<MenuLink to="/play" name="Back" /></div>
  </PageLayout>;
}

function ReadyTable({ room, selection }: { room: ReturnType<typeof useGolfRoom>; selection: SelectionStyle }) {
  const { user } = useAuth();
  const state = room.state!;
  const navigate = useNavigate();
  const { table, participants } = useServerGolfTable(state, room.command, room.pending || !room.connected);
  const completed = state.game!.phase === "game-over";
  const wasComplete = useRef(false);
  const wasConnected = useRef(room.connected);
  useEffect(() => { if (room.connected) wasConnected.current = true; }, [room.connected]);
  useEffect(() => {
    if (completed && !wasComplete.current) window.dispatchEvent(new Event("golf:results"));
    wasComplete.current = completed;
  }, [completed]);
  const inactivityNotice = state.idleWarning ? <div className="golf-connection-status" role="alert">You’ll be removed for inactivity in 1 minute. Make a move to stay in the game.</div> : undefined;
  const connectionNotice = room.error || (!room.connected && wasConnected.current) ? <div className="golf-connection-status" role={room.error ? "alert" : "status"}>
    {room.error || "Reconnecting to your table… Your seat is saved."}{" "}<button className="link" type="button" onClick={room.retry}>Retry</button>
  </div> : inactivityNotice;
  return <GolfTableView count={state.seats.length} selection={selection} table={table} participants={participants}
    multiplayer={state.mode === "multiplayer"} isHost={state.isHost} disconnected={!room.connected} pending={room.pending}
    rematchWaiting={room.pending || !room.connected}
    onLeave={() => { void room.command("leave").then(left => { if (left) navigate("/play"); }); }}
    leaveError={room.error}
    connectionNotice={connectionNotice} resultNotice={connectionNotice || (user && <p className="quiet-text">Your results have been saved.</p>)} />;
}

function ConnectedGame({ code, selection = selectionStyle(null), initialState = null, botGame = false }: {
  code: string; selection?: SelectionStyle; initialState?: RoomState | null; botGame?: boolean;
}) {
  const room = useGolfRoom(code, initialState);
  const state = room.state;
  if (room.removedReason) return <PageLayout title="REMOVED FROM GAME">
    <p role="alert">{room.removedReason === "idle" ? "You were removed for inactivity." : "You’re no longer seated at this table."}</p>
    <MenuLink to="/play" name="Back to Play" />
  </PageLayout>;
  if (state?.closed) return <LobbyRoom room={room} />;
  if (state?.game) return <ReadyTable room={room} selection={selection} />;
  if (state) return <LobbyRoom room={room} />;
  if (botGame) return <BotTableLoading error={room.error} retry={room.retry} />;
  if (room.needsJoin) return <JoinLobby code={code} retry={room.retry} />;
  return <PageLayout title="JOINING TABLE">
    {room.error ? <p role="alert" className="inline-error">{room.error}{" "}<button type="button" className="link" onClick={room.retry}>Try again</button></p> : <p role="status">Finding your table…</p>}
    <div className="button-stack"><MenuLink to="/play" name="Back" /></div>
  </PageLayout>;
}

export default function OnlineGame() {
  const { code = "" } = useParams();
  return <><Helmet><title>Golf · Multiplayer</title></Helmet><ConnectedGame key={code} code={code.toUpperCase()} /></>;
}
