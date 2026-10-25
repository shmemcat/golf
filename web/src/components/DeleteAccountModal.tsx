import { useEffect, useRef, useState, type ButtonHTMLAttributes } from "react";
import { Button } from "./Buttons";
import styles from "./DeleteAccountModal.module.css";

export function DangerButton({ name, type = "button", ...props }: Omit<ButtonHTMLAttributes<HTMLButtonElement>, "name"> & { name: string }) {
  return <button {...props} type={type} className={styles.dangerButton}>
    <span className={styles.dangerShine} aria-hidden="true" />
    {name}
  </button>;
}

export function DeleteAccountModal({ onClose, onDelete }: {
  onClose: () => void;
  onDelete: (password: string) => Promise<void>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const passwordInput = useRef<HTMLInputElement>(null);
  const [confirm, setConfirm] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const element = dialog.current!;
    const previous = document.activeElement as HTMLElement | null;
    element.showModal();
    element.querySelector<HTMLButtonElement>("[data-cancel]")?.focus();
    return () => {
      element.close();
      previous?.focus();
    };
  }, []);

  useEffect(() => {
    if (confirm) passwordInput.current?.focus();
  }, [confirm]);

  const remove = async () => {
    if (busy) return;
    if (!password) {
      setError("Please enter your password.");
      passwordInput.current?.focus();
      return;
    }
    setBusy(true);
    setError("");
    try {
      await onDelete(password);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unable to delete your account.");
    } finally {
      setBusy(false);
    }
  };

  return <dialog ref={dialog} className={styles.modal} aria-labelledby="delete-account-title" aria-describedby="delete-account-description"
    onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}
    onClick={event => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <h2 id="delete-account-title" className={styles.title}>{confirm ? "Confirm Deletion" : "Delete Account"}</h2>
    <p id="delete-account-description" className={styles.message}>
      {confirm
        ? "Enter your password to permanently delete your shared Cards account across Cards, Hearts, Euchre, and Golf."
        : "Are you sure? This will delete your shared account and its saved user data across Cards, Hearts, Euchre, and Golf. This cannot be undone."}
    </p>
    {confirm && <form className={styles.form} aria-label="Confirm deletion" aria-busy={busy} noValidate onSubmit={event => { event.preventDefault(); void remove(); }}>
      <label className="sr-only" htmlFor="delete-password">Password</label>
      <input ref={passwordInput} id="delete-password" name="password" type="password" autoComplete="current-password"
        placeholder="Password" required maxLength={1024} readOnly={busy} value={password}
        aria-invalid={!!error} aria-describedby={error ? "delete-account-error" : undefined}
        onChange={event => { setPassword(event.target.value); setError(""); }} />
      {error && <p id="delete-account-error" role="alert" className="inline-error">{error}</p>}
      <DangerButton type="submit" name={busy ? "Deleting…" : "Delete"} disabled={busy} />
    </form>}
    <div className={styles.buttons}>
      {!confirm && <DangerButton name="Yes" onClick={() => setConfirm(true)} />}
      <Button name={confirm ? "Nevermind" : "No"} onClick={onClose} disabled={busy} data-cancel />
    </div>
  </dialog>;
}
