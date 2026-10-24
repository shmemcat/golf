import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSpade } from "@fortawesome/pro-solid-svg-icons/faSpade";
import { faHeart } from "@fortawesome/pro-solid-svg-icons/faHeart";
import { faClub } from "@fortawesome/pro-solid-svg-icons/faClub";
import { faDiamond } from "@fortawesome/pro-solid-svg-icons/faDiamond";
import { asset } from "@/lib/assets";
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
}: {
  rank?: string;
  suit?: keyof typeof suits;
}) {
  if (!rank)
    return (
      <img
        className="playing-card card-back"
        src={asset("cards/back.svg")}
        alt="Face-down card"
        width="80"
        height="112"
      />
    );
  const [label, icon] = suits[suit];
  return (
    <div
      className={`playing-card card-face ${
        suit === "H" || suit === "D" ? "red-suit" : ""
      }`}
      role="img"
      aria-label={`${rankNames[rank] || rank} of ${label}`}
    >
      <span className="card-label">
        <span>{rank}</span>
        <FontAwesomeIcon icon={icon} />
      </span>
    </div>
  );
}
