import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import {
  GolfError,
  golfGet,
  golfPost,
  newRequestId,
  roomPath,
  type RoomState,
} from "@/lib/golfApi";
import {
  clearLocalGame,
  readLocalGame,
  readLocalGames,
  type LocalGame,
} from "@/lib/localGame";

type ActiveSession = {
  key: string;
  type: "solo" | "online";
  playing: boolean;
  destination: string;
  localGame?: LocalGame;
} & ({ localId: string; room?: never } | { localId?: never; room: RoomState });

// Fetch the current revision before leaving: the game clock continues off-page.
async function leaveRoom(code: string) {
  const actionId = newRequestId();
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const { state } = await golfGet<{ state: RoomState }>(roomPath(code));
      await golfPost(roomPath(code) + "/actions", {
        action: "leave",
        actionId,
        revision: state.revision,
        actionToken: state.actionTokens?.leave,
      });
      return;
    } catch (error) {
      if (error instanceof GolfError) {
        if (["NOT_FOUND", "NOT_SEATED"].includes(error.code)) return;
        if (attempt < 2 && ["STALE_STATE", "UNAVAILABLE"].includes(error.code))
          continue;
      }
      throw error;
    }
  }
}

export function useActiveGameSession() {
  const { user, loading } = useAuth();
  const owner = user?.id ?? null;
  const [localGames, setLocalGames] = useState(readLocalGames);
  const [lookup, setLookup] = useState<{
    owner: typeof owner;
    rooms: RoomState[] | null;
    pending: boolean;
  }>({ owner, rooms: null, pending: true });
  const [attempt, setAttempt] = useState(0);
  const [lookupError, setLookupError] = useState("");
  const [leaveError, setLeaveError] = useState("");
  const [leaving, setLeaving] = useState<{
    owner: typeof owner;
    session: ActiveSession;
  } | null>(null);
  const dismissed = useRef(new Set<string>());
  const working = useRef(false);
  const [online, setOnline] = useState(navigator.onLine);
  const retry = () => setAttempt((value) => value + 1);

  useEffect(() => {
    const refresh = () => {
      setOnline(navigator.onLine);
      setLocalGames(readLocalGames());
      retry();
    };
    const offline = () => setOnline(false);
    window.addEventListener("focus", refresh);
    window.addEventListener("storage", refresh);
    window.addEventListener("online", refresh);
    window.addEventListener("offline", offline);
    return () => {
      window.removeEventListener("focus", refresh);
      window.removeEventListener("storage", refresh);
      window.removeEventListener("online", refresh);
      window.removeEventListener("offline", offline);
    };
  }, []);

  useEffect(() => {
    if (loading) return;
    const controller = new AbortController();
    setLocalGames(readLocalGames());
    setLookup((previous) => ({
      owner,
      rooms: previous.owner === owner ? previous.rooms : null,
      pending: true,
    }));
    setLeaveError("");
    setLookupError("");
    void golfGet<{ rooms: RoomState[] }>("/active", controller.signal)
      .then(({ rooms }) => {
        if (!Array.isArray(rooms))
          throw new Error("Couldn’t check your saved games. Please try again.");
        if (!controller.signal.aborted)
          setLookup({ owner, rooms, pending: false });
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setLookup((previous) => ({ ...previous, owner, pending: false }));
          setLookupError("Couldn’t load your saved games. Please try again.");
        }
      });
    return () => controller.abort();
  }, [owner, loading, attempt]);

  const rooms = !loading && lookup.owner === owner ? lookup.rooms ?? [] : [];
  const available = rooms.filter(
    (room) =>
      !dismissed.current.has(`${owner}:${room.code}`) &&
      !room.closed &&
      room.stage !== "closed" &&
      !!room.game &&
      room.game.phase !== "game-over"
  );
  const local = !loading && !user ? localGames : [];
  const sessions: ActiveSession[] = available.map((room) => ({
    key: `room:${room.code}:${room.game?.id ?? "lobby"}:${
      room.game?.phase === "game-over" ? "finished" : "active"
    }`,
    type: room.mode === "bot" ? "solo" : "online",
    playing: !!room.game && room.game.phase !== "game-over",
    room,
    destination:
      room.mode === "bot"
        ? `/game/single?players=${room.capacity}&room=${encodeURIComponent(
            room.code
          )}`
        : `/game/${
            room.game && room.game.phase !== "game-over"
              ? "multiplayer"
              : "lobby"
          }/${encodeURIComponent(room.code)}`,
  }));
  sessions.unshift(
    ...local.map((game) => ({
      key: `local:${game.game.id}`,
      type: "solo" as const,
      playing: true,
      localId: game.game.id,
      localGame: game,
      destination: `/game/single?players=${
        game.game.players.length
      }&game=${encodeURIComponent(game.game.id)}`,
    }))
  );
  const current =
    sessions.find((item) => item.type === "solo") ?? sessions[0] ?? null;
  const session =
    !loading && leaving?.owner === owner ? leaving.session : current;
  const checking = loading || lookup.owner !== owner || lookup.pending;

  async function leave(selectedKey: string | undefined = session?.key) {
    const selected = sessions.find((item) => item.key === selectedKey);
    if (!selected || working.current) return;
    const session = selected;
    working.current = true;
    setLeaving({ owner, session });
    setLeaveError("");
    try {
      if (session.localId) {
        clearLocalGame(session.localId);
        if (readLocalGame(session.localId))
          throw new Error(
            "Your saved game couldn’t be cleared. Please allow browser storage and try again."
          );
        setLocalGames(readLocalGames());
      } else if (session.room) {
        await leaveRoom(session.room.code);
        dismissed.current.add(`${owner}:${session.room.code}`);
        setLookup((previous) =>
          previous.owner === owner
            ? {
                ...previous,
                rooms:
                  previous.rooms?.filter(
                    (room) => room.code !== session.room!.code
                  ) ?? null,
              }
            : previous
        );
        window.dispatchEvent(new Event("golf:results"));
      }
    } catch (error) {
      setLeaveError(
        error instanceof Error
          ? error.message
          : "Couldn’t leave your game. Please try again."
      );
      throw error;
    } finally {
      working.current = false;
      setLeaving(null);
    }
  }

  return {
    session,
    sessions,
    checking,
    leave,
    busy: !!leaving,
    leaveError,
    lookupError,
    online,
    retry,
  };
}
