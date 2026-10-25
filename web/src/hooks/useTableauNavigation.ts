import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type PointerEvent } from "react";

export const MOBILE_TABLE_QUERY = "(max-width: 700px)";

// The shortest route around the table; ties move clockwise.
export function seatOffset(seat: number, viewed: number, count: number) {
  const forward = (seat - viewed + count) % count;
  return forward > count / 2 ? forward - count : forward;
}

export function useTableauNavigation(count: number, target: number) {
  const [mobile, setMobile] = useState(() => window.matchMedia(MOBILE_TABLE_QUERY).matches);
  const [following, setFollowing] = useState(true);
  const [browsedSeat, setBrowsedSeat] = useState(0);
  const gesture = useRef<{ x: number; y: number; id: number } | null>(null);
  const suppressClick = useRef(false);
  const cycled = mobile && count >= 4;
  const viewedSeat = following ? target : browsedSeat;

  useEffect(() => {
    const media = window.matchMedia(MOBILE_TABLE_QUERY);
    const change = () => setMobile(media.matches);
    media.addEventListener("change", change);
    return () => media.removeEventListener("change", change);
  }, []);

  const view = (seat: number) => {
    setBrowsedSeat((seat + count) % count);
    setFollowing(false);
  };
  const move = (direction: number) => view(viewedSeat + direction);

  return {
    mobile, cycled, following, viewedSeat, view, move,
    toggleFollowing() {
      setBrowsedSeat(viewedSeat);
      setFollowing(value => !value);
    },
    swipe: {
      onPointerDown(event: PointerEvent<HTMLDivElement>) {
        if (event.button !== 0 || !event.isPrimary) return;
        suppressClick.current = false;
        gesture.current = { x: event.clientX, y: event.clientY, id: event.pointerId };
      },
      onPointerMove(event: PointerEvent<HTMLDivElement>) {
        const start = gesture.current;
        if (!start || start.id !== event.pointerId) return;
        const dx = event.clientX - start.x;
        if (Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(event.clientY - start.y) * 1.5) {
          event.currentTarget.setPointerCapture?.(event.pointerId);
          suppressClick.current = true;
        }
      },
      onPointerUp(event: PointerEvent<HTMLDivElement>) {
        const start = gesture.current;
        gesture.current = null;
        if (!start || start.id !== event.pointerId) return;
        const dx = event.clientX - start.x;
        if (Math.abs(dx) >= 48 && Math.abs(dx) > Math.abs(event.clientY - start.y) * 1.5) {
          suppressClick.current = true;
          move(dx < 0 ? 1 : -1);
        }
      },
      onPointerCancel() { gesture.current = null; },
      onClickCapture(event: MouseEvent<HTMLDivElement>) {
        if (suppressClick.current) {
          event.preventDefault();
          event.stopPropagation();
          suppressClick.current = false;
        }
      },
      onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
        event.preventDefault();
        move(event.key === "ArrowRight" ? 1 : -1);
      },
    },
  };
}
