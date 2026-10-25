import { Link } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faExclamationCircle } from "@fortawesome/pro-solid-svg-icons";
import { useAuth } from "@/context/AuthContext";
import styles from "./LoginWarning.module.css";

export function LoginWarning() {
  const { user, loading } = useAuth();

  if (loading || user) return null;

  return (
    <div className={styles.warning}>
      <h2 className={styles.title}>
        <FontAwesomeIcon
          icon={faExclamationCircle}
          className={styles.icon}
          shake
        />
        Pssst
      </h2>
      <span>We noticed you&apos;re not signed in!</span>
      <span className={styles.message}>
        If you wish to save your game data,<br/>don&apos;t forget to{" "}
        <Link to="/user" className={`link ${styles.signIn}`}>
          sign in.
        </Link>
      </span>
    </div>
  );
}
