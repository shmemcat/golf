import { Card } from "@/components/Card";
import type { GolfCard } from "@/game/engine";

export function FlipCard({ card, faceUp, ownerBack }: { card: GolfCard; faceUp: boolean; ownerBack?: string }) {
  return (
    <div className="golf-flip-card" data-face-up={faceUp} aria-hidden="true">
      <div className="golf-card-rotator">
        <div className="golf-card-side golf-card-back"><Card ownerBack={ownerBack} /></div>
        <div className="golf-card-side golf-card-front"><Card rank={card.rank} suit={card.suit} /></div>
      </div>
    </div>
  );
}
