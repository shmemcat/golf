import type { CSSProperties } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faGolfFlagHole } from "@fortawesome/pro-regular-svg-icons/faGolfFlagHole";
import { asset } from "@/lib/assets";

export function GolfLogo({
  size = 300,
  variant = "display",
  style,
}: {
  size?: number;
  style?: CSSProperties;
  variant?: "display" | "brand";
}) {
  return (
    <div
      className="golf-logo"
      aria-hidden="true"
      style={{ width: size, height: size, ...style }}
    >
      {variant === "brand" ? (
        <FontAwesomeIcon
          icon={faGolfFlagHole}
          style={{ width: "100%", height: "100%" }}
        />
      ) : (
        <svg
          viewBox="0 0 512 512"
          style={{
            width: "100%",
            height: "100%",
            display: "block",
            overflow: "visible",
          }}
        >
          <use href={`${asset("icons/golf.svg")}#golf-mark`} />
        </svg>
      )}
    </div>
  );
}
