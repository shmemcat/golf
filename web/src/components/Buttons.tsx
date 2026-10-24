import type { ButtonHTMLAttributes } from "react";
import { Link } from "react-router-dom";
import styles from "@/styles/buttons.module.css";
type ButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "name"> & {
  name: string;
  variant?: "primary" | "secondary";
  size?: "menu" | "compact";
};
export function Button({
  name,
  variant = "primary",
  size = "menu",
  className = "",
  type = "button",
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      className={[
        styles["menu-button"],
        variant === "secondary" ? styles["button-secondary"] : "",
        size === "compact" ? styles["button-compact"] : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      type={type}
    >
      <span className={styles["button-shine"]} aria-hidden="true" />
      {children ?? name}
    </button>
  );
}
export function MenuLink({ to, name }: { to: string; name: string }) {
  return (
    <Link className={`${styles["menu-button"]} menu-link`} to={to}>
      <span className={styles["button-shine"]} aria-hidden="true" />
      {name}
    </Link>
  );
}
export function RulesButton({
  name,
  selected,
  onClick,
}: {
  name: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      data-selected={selected}
      aria-pressed={selected}
      onClick={onClick}
      className={`${
        selected ? styles["rules-button-selected"] : styles["rules-button"]
      } rules-tab`}
    >
      {name}
    </button>
  );
}
