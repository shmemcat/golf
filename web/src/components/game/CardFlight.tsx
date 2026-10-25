import { useLayoutEffect, useState, type RefObject } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { FlipCard } from "./FlipCard";
import { FLIGHT_MS, type TableMotion } from "@/hooks/useGolfTable";

export function CardFlight({ flight, board, viewedSeat }: { flight: TableMotion; board: RefObject<HTMLDivElement | null>; viewedSeat?: number }) {
  const [rects, setRects] = useState<{ from: DOMRect; to: DOMRect; fromOffscreen: boolean; toOffscreen: boolean } | null>(null);
  const [faceUp, setFaceUp] = useState(!flight.flip);
  const reduced = useReducedMotion();
  useLayoutEffect(() => {
    const from = board.current?.querySelector(`[data-anchor="${flight.from}"]`);
    const to = board.current?.querySelector(`[data-anchor="${flight.to}"]`);
    if (from && to) {
      const viewport = board.current?.querySelector(".golf-table-viewport")?.getBoundingClientRect();
      const fromOffscreen = !!from.closest('[data-offscreen="true"]');
      const toOffscreen = !!to.closest('[data-offscreen="true"]');
      // Hidden tableaux still have real geometry. Bring their flight endpoints to
      // the corresponding screen edge so every draw/discard remains visible.
      const endpoint = (element: Element, offscreen: boolean) => {
        const rect = element.getBoundingClientRect();
        if (!offscreen || !viewport) return rect;
        const left = rect.left < viewport.left ? -rect.width : window.innerWidth;
        const top = Math.max(viewport.top + 40, Math.min(rect.top, window.innerHeight - rect.height - 20));
        return new DOMRect(left, top, rect.width, rect.height);
      };
      setRects({ from: endpoint(from, fromOffscreen), to: endpoint(to, toOffscreen), fromOffscreen, toOffscreen });
    }
  }, [flight, board, viewedSeat]);

  useLayoutEffect(() => {
    // Finish the reveal before arrival; already exposed cards never rotate.
    const timer = flight.flip ? window.setTimeout(() => setFaceUp(true), 24) : undefined;
    return () => clearTimeout(timer);
  }, [flight]);
  if (!rects || (rects.fromOffscreen && rects.toOffscreen)) return null;
  return (
    <motion.div
      className="golf-card-flight"
      aria-hidden="true"
      data-offscreen-flight={rects.fromOffscreen || rects.toOffscreen}
      style={{ width: rects.from.width, height: rects.from.height, transformOrigin: "0 0" }}
      initial={{ x: rects.from.left, y: rects.from.top, scaleX: 1, scaleY: 1, opacity: rects.fromOffscreen ? 0 : 1 }}
      animate={{ x: rects.to.left, y: rects.to.top, scaleX: rects.to.width / (rects.from.width || 1),
        scaleY: rects.to.height / (rects.from.height || 1),
        opacity: reduced ? 0 : rects.toOffscreen ? [1, 1, 0] : rects.fromOffscreen ? [0, 1, 1] : 1 }}
      transition={{ duration: FLIGHT_MS / 1000, ease: [0.22, 0.68, 0.26, 1] }}
    >
      <FlipCard card={flight.card} faceUp={faceUp} />
    </motion.div>
  );
}
