import { useCallback, useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import { GolfError, golfGet, golfPost, golfSession, newRequestId, roomPath, type RoomState } from "@/lib/golfApi";
import { useAuth } from "@/context/AuthContext";
import { resumeOnWake } from "@/lib/socketResume";

export function useGolfRoom(code: string, initialState: RoomState | null = null) {
  const { user } = useAuth();
  const [state, setState] = useState<RoomState | null>(() => initialState?.code === code ? initialState : null);
  const latest = useRef(state);
  const accountId = useRef(user?.id);
  const [error, setError] = useState("");
  const [needsJoin, setNeedsJoin] = useState(false);
  const [removedReason, setRemovedReason] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [pending, setPending] = useState(false);
  const busy = useRef(false);
  const [attempt, setAttempt] = useState(0);
  const retry = () => setAttempt(n => n + 1);
  const accept = useCallback((next: RoomState) => {
    if (next.code !== code || (latest.current && next.revision < latest.current.revision)) return;
    latest.current = next;
    setState(next);
  }, [code]);
  useEffect(() => {
    let alive = true;
    if (latest.current?.code !== code || accountId.current !== user?.id) {
      latest.current = null;
      setState(null);
    }
    accountId.current = user?.id;
    setConnected(false);
    setError("");
    setNeedsJoin(false);
    setRemovedReason(null);
    const noLongerSeated = (reason: string) => {
      setConnected(false);
      if (latest.current && !latest.current.game) {
        latest.current = null;
        setState(null);
        setNeedsJoin(true);
      } else setRemovedReason(reason);
    };
    const socket = io("/golf", {
      path: "/golf/socket.io", withCredentials: true, autoConnect: false,
      auth: done => { void golfSession().then(s => done({ csrf_token: s.csrf_token })).catch(e => { if (alive) setError(e.message); }); },
    });
    socket.on("golf:state", (next: RoomState) => { if (alive) accept(next); });
    socket.on("golf:removed", (event: { reason?: string } = {}) => { if (alive) { noLongerSeated(event.reason || "removed"); setError("You’re no longer seated at this table."); } });
    const subscribe = () => {
      socket.emit("golf:subscribe", { code }, (reply: { ok: boolean; state?: RoomState; error?: string }) => {
        if (!alive) return;
        if (reply.ok && reply.state) { accept(reply.state); setConnected(true); setError(""); }
        else { setConnected(false); setError(reply.error || "Couldn’t join the table."); if ((reply as { code?: string }).code === "NOT_SEATED") noLongerSeated("removed"); }
      });
    };
    socket.on("connect", subscribe);
    socket.on("disconnect", () => { if (alive) setConnected(false); });
    socket.on("connect_error", () => { if (alive) { setConnected(false); setError("Couldn’t connect to your table. Please retry."); } });
    if (latest.current) socket.connect();
    else void golfGet<{ state: RoomState }>(roomPath(code)).then(({ state: next }) => {
      if (alive) { accept(next); socket.connect(); }
    }).catch(e => { if (alive) { setError(e.message); setNeedsJoin(e instanceof GolfError && e.code === "NOT_SEATED"); } });
    const stopWake = resumeOnWake(
      () => { socket.disconnect(); socket.connect(); },
      () => { if (socket.connected) subscribe(); else socket.connect(); },
    );
    return () => { alive = false; stopWake(); socket.removeAllListeners(); socket.disconnect(); };
  }, [code, accept, attempt, user?.id]);
  const command = async (action: string, detail: Record<string, unknown> = {}) => {
    if (!state || busy.current) return false;
    busy.current = true;
    setPending(true);
    setError("");
    // Keep the command bound to the board that rendered the clicked control.
    const payload = { ...detail, action, actionId: newRequestId(), revision: state.revision, actionToken: state.actionTokens?.[action] };
    try {
      // The same action ID can safely be retried after a lost response.
      let response: { state: RoomState | { left: true } };
      try { response = await golfPost(roomPath(code) + "/actions", payload); }
      catch (e) {
        if (!(e instanceof GolfError) || e.code !== "UNAVAILABLE") throw e;
        response = await golfPost(roomPath(code) + "/actions", payload);
      }
      if (!("left" in response.state)) accept(response.state);
      return true;
    } catch (e) {
      if (action === "leave" && e instanceof GolfError && e.code === "NOT_SEATED") return true;
      setError(e instanceof Error ? e.message : "Please try that move again.");
      if (e instanceof GolfError && e.code === "STALE_STATE") {
        try { accept((await golfGet<{ state: RoomState }>(roomPath(code))).state); } catch { /* Keep the original error visible. */ }
      }
      return false;
    } finally { busy.current = false; setPending(false); }
  };
  return { state, error, connected, pending, command, retry, needsJoin, removedReason };
}
