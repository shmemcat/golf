import { useEffect, useRef, useState } from "react";
import type { Game } from "@/game/engine";
import { useAuth } from "@/context/AuthContext";
import { recordResult } from "@/lib/results";

// Only mounted by regular play; layout studies never record results.
export function useGameResults(game: Game) {
  const { user, loading } = useAuth();
  const owner = useRef<{ gameId: string; userId: string | null; saved: boolean } | undefined>(undefined);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (owner.current?.gameId !== game.id) {
      owner.current = undefined;
      setError("");
    }
    if (loading) return;
    if (!owner.current) owner.current = { gameId: game.id, userId: user?.id ?? null, saved: false };
    // A guest game or an account change cannot assign a game to another user.
    if (owner.current.userId !== (user?.id ?? null)) owner.current.userId = null;
    if (!owner.current.userId || owner.current.saved || game.phase !== "game-over") return;
    if (recordResult(game, owner.current.userId)) {
      owner.current.saved = true;
      setError("");
    } else {
      setError("Your result couldn’t be saved. Please allow browser storage and try again.");
    }
  }, [game, user?.id, loading, attempt]);

  return { error, retry: () => setAttempt(value => value + 1) };
}
