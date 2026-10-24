import { useEffect, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faUser } from "@fortawesome/pro-solid-svg-icons/faUser";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";

// Load the full shared catalog only when an account uses a custom icon.
export function ProfileIcon({ name }: { name?: string }) {
  const [icon, setIcon] = useState<IconDefinition>(faUser);
  useEffect(() => {
    let active = true;
    setIcon(faUser);
    if (name && name !== "user") {
      void import("@/lib/profileIcons")
        .then(({ getProfileIcon }) => {
          if (active) setIcon(getProfileIcon(name));
        })
        .catch(() => {});
    }
    return () => {
      active = false;
    };
  }, [name]);
  return <FontAwesomeIcon icon={icon} />;
}
