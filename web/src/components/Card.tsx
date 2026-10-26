import { faSpade } from "@fortawesome/pro-solid-svg-icons/faSpade";
import { faHeart } from "@fortawesome/pro-solid-svg-icons/faHeart";
import { faClub } from "@fortawesome/pro-solid-svg-icons/faClub";
import { faDiamond } from "@fortawesome/pro-solid-svg-icons/faDiamond";
import { asset } from "@/lib/assets";
import { useCardBack } from "@/context/CardBackContext";
import { cardBackAsset, type CardBackId } from "@/lib/cardBacks";
const suits = {
  S: ["spades", faSpade],
  H: ["hearts", faHeart],
  C: ["clubs", faClub],
  D: ["diamonds", faDiamond],
} as const;
const rankNames: Record<string, string> = {
  A: "Ace",
  J: "Jack",
  Q: "Queen",
  K: "King",
};
export function Card({
  rank,
  suit = "S",
  back,
}: {
  rank?: string;
  suit?: keyof typeof suits;
  back?: CardBackId;
}) {
  if (!rank) return <FaceDownCard back={back} />;
  const [label, icon] = suits[suit];
  const [iconWidth, iconHeight, , , paths] = icon.icon;
  return (
    <div
      className={`playing-card card-face ${
        suit === "H" || suit === "D" ? "red-suit" : ""
      }`}
      role="img"
      aria-label={`${rankNames[rank] || rank} of ${label}`}
    >
      {/* One coordinate system keeps the face proportional at every card size. */}
      <svg className="card-art" viewBox="0 0 80 112" aria-hidden="true" focusable="false">
        <text x="40" y="50" textAnchor="middle">{rank}</text>
        <svg x="28" y="60" width="24" height="24" viewBox={`0 0 ${iconWidth} ${iconHeight}`}>
          {(Array.isArray(paths) ? paths : [paths]).map((path, index) => <path key={index} d={path} />)}
        </svg>
      </svg>
    </div>
  );
}

function FaceDownCard({ back }: { back?: CardBackId }) {
  const { cardBack } = useCardBack();
  const selected = back ?? cardBack;
  return <span className="playing-card card-back" role="img" aria-label="Face-down card" data-card-back={selected}>
    <img src={asset(cardBackAsset(selected, "light"))} alt="" width="80" height="112" draggable={false} aria-hidden="true" />
    <img className="card-back-dark" src={asset(cardBackAsset(selected, "dark"))} alt="" width="80" height="112" draggable={false} aria-hidden="true" />
  </span>;
}
