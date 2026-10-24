import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faGear } from "@fortawesome/pro-solid-svg-icons/faGear";
import styles from "./SettingsGear.module.css";

const MENU_ITEMS = [
  { to: "/profile", label: "Profile" },
  { to: "/options", label: "Options" },
];

export function SettingsGear({ exclude }: { exclude?: string }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!wrap.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        trigger.current?.focus();
      }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);
  return (
    <div ref={wrap} className={styles.wrap} data-modal-open={open}>
      <button
        ref={trigger}
        type="button"
        className={styles.gearBtn}
        aria-label="Settings menu"
        aria-expanded={open}
        aria-controls="account-settings-links"
        onClick={() => setOpen(!open)}
      >
        <FontAwesomeIcon icon={faGear} />
      </button>
      <div className={styles.drop} hidden={!open} id="account-settings-links">
        <nav className={styles.inner} aria-label="Account settings">
          {MENU_ITEMS.filter((item) => item.to !== exclude).map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className={styles.menuItem}
              onClick={() => setOpen(false)}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
    </div>
  );
}
