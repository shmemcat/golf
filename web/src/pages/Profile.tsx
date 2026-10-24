import { useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCircleCheck } from "@fortawesome/pro-solid-svg-icons/faCircleCheck";
import { faTriangleExclamation } from "@fortawesome/pro-solid-svg-icons/faTriangleExclamation";
import { PageLayout } from "@/components/ui/PageLayout";
import { MenuLink } from "@/components/Buttons";
import { useAuth } from "@/context/AuthContext";
import {
  PROFILE_ICONS,
  PROFILE_ICON_CATEGORIES,
  getProfileIcon,
} from "@/lib/profileIcons";
import styles from "@/styles/profile.module.css";

export default function Profile() {
  const { user, loading, updateProfile } = useAuth();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState(user?.email ?? "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    setEmail(user?.email ?? "");
  }, [user?.email]);
  const save = async (data: { profile_icon?: string; email?: string }) => {
    if (busy) return;
    setBusy(true);
    setMessage("");
    setError("");
    try {
      const result = await updateProfile(data);
      setMessage(result.message || "Profile saved.");
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Unable to save your profile."
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <Helmet>
        <title>Profile | Golf</title>
      </Helmet>
      <PageLayout title="PROFILE">
        {user ? (
          <>
            <h2>Profile Icon</h2>
            <div className={styles.iconPreview}>
              <button
                type="button"
                className={`${styles.iconPreviewCircle} ${styles.iconPreviewClickable}`}
                aria-label="Toggle icon picker"
                aria-expanded={open}
                aria-controls="profile-icon-picker"
                onClick={() => setOpen(!open)}
              >
                <FontAwesomeIcon icon={getProfileIcon(user.profile_icon)} />
              </button>
              <span className={styles.iconPreviewLabel}>
                {PROFILE_ICONS.find((icon) => icon.key === user.profile_icon)
                  ?.label ?? "Default"}
              </span>
              <span className={styles.iconPreviewHint}>
                {open ? "tap to close" : "tap to change"}
              </span>
            </div>
            {open && (
              <div id="profile-icon-picker" className={styles.pickerContainer}>
                <div className={styles.pickerInner}>
                  {PROFILE_ICON_CATEGORIES.map((category) => (
                    <section key={category}>
                      <h3 className={styles.categoryLabel}>{category}</h3>
                      <div className={styles.iconGrid}>
                        {PROFILE_ICONS.filter(
                          (icon) => icon.category === category
                        ).map((icon) => (
                          <button
                            key={icon.key}
                            type="button"
                            className={`${styles.iconCell} ${
                              user.profile_icon === icon.key
                                ? styles.iconCellActive
                                : ""
                            }`}
                            aria-label={icon.label}
                            aria-pressed={
                              (user.profile_icon ?? "user") === icon.key
                            }
                            disabled={busy}
                            onClick={() =>
                              void save({
                                profile_icon: icon.key,
                              })
                            }
                          >
                            <FontAwesomeIcon icon={icon.icon} />
                          </button>
                        ))}
                      </div>
                    </section>
                  ))}
                </div>
              </div>
            )}
            <section className={styles.emailSection}>
              <h2>Email</h2>
              <form
                className={styles.emailRow}
                onSubmit={(event) => {
                  event.preventDefault();
                  void save({ email: email.trim() });
                }}
              >
                <label className="sr-only" htmlFor="profile-email">
                  Email address
                </label>
                <input
                  id="profile-email"
                  type="email"
                  name="email"
                  autoComplete="email"
                  required
                  maxLength={255}
                  value={email}
                  readOnly={busy}
                  onChange={(event) => setEmail(event.target.value)}
                />
                <button
                  className={styles.emailSaveBtn}
                  type="submit"
                  disabled={
                    busy ||
                    email.trim().toLowerCase() ===
                      (user.email ?? "").toLowerCase()
                  }
                >
                  {busy ? "Saving…" : "Save"}
                </button>
              </form>
              <div
                className={`${styles.verificationStatus} ${
                  user.email_verified ? styles.verified : styles.notVerified
                }`}
              >
                <FontAwesomeIcon
                  icon={
                    user.email_verified ? faCircleCheck : faTriangleExclamation
                  }
                />
                <span>{user.email_verified ? "Verified" : "Not verified"}</span>
              </div>
            </section>
          </>
        ) : (
          <p>{loading ? "Loading…" : "Sign in to customize your profile."}</p>
        )}
        {message && (
          <p role="status" className={styles.emailMessage}>
            {message}
          </p>
        )}
        {error && (
          <p role="alert" className="inline-error">
            {error}
          </p>
        )}
        <div className="button-stack">
          <MenuLink to="/user" name={user ? "Back" : "Sign In"} />
          <MenuLink to="/" name="Home" />
        </div>
      </PageLayout>
    </>
  );
}
