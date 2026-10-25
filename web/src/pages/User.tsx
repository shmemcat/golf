import { useEffect, useRef, useState, type FormEvent } from "react";
import { Helmet } from "react-helmet-async";
import { useLocation } from "react-router-dom";
import { AccountDashboard } from "@/components/AccountDashboard";
import { PageLayout } from "@/components/ui/PageLayout";
import { Button, MenuLink } from "@/components/Buttons";
import { useAuth } from "@/context/AuthContext";
import { cardsLink } from "@/lib/links";

export default function User() {
  const { user, loading, error, login } = useAuth();
  const { state } = useLocation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [fieldError, setFieldError] = useState<{
    field: "username" | "password";
    message: string;
  } | null>(null);
  const usernameInput = useRef<HTMLInputElement>(null);
  const passwordInput = useRef<HTMLInputElement>(null);
  const busy = loading || submitting;

  useEffect(() => {
    if (user) {
      setUsername("");
      setPassword("");
      setFieldError(null);
    }
  }, [user]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (!username.trim()) {
      setFieldError({
        field: "username",
        message: "Please enter your username or email.",
      });
      usernameInput.current?.focus();
      return;
    }
    if (!password) {
      setFieldError({
        field: "password",
        message: "Please enter your password.",
      });
      passwordInput.current?.focus();
      return;
    }
    setFieldError(null);
    setSubmitting(true);
    try {
      await login(username.trim(), password);
    } finally {
      setSubmitting(false);
    }
  }
  if (user) return <AccountDashboard />;
  return (
    <>
      <Helmet>
        <title>Sign In | Golf</title>
      </Helmet>
      <PageLayout title="SIGN IN">
        <div className="account-body">
          {typeof state?.notice === "string" && (
            <p role="status">{state.notice}</p>
          )}
          <form
            onSubmit={submit}
            className="signin-form"
            aria-label="Sign in"
            aria-busy={busy}
            noValidate
          >
            <label htmlFor="username">
              <span className="sr-only">Username or Email</span>
              <input
                ref={usernameInput}
                id="username"
                name="username"
                type="text"
                autoComplete="username"
                placeholder="Username or Email"
                maxLength={255}
                autoCapitalize="none"
                spellCheck={false}
                required
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value);
                  if (fieldError?.field === "username") setFieldError(null);
                }}
                aria-invalid={fieldError?.field === "username"}
                aria-describedby={
                  fieldError?.field === "username"
                    ? "sign-in-field-error"
                    : undefined
                }
                readOnly={busy}
              />
            </label>
            <label htmlFor="password">
              <span className="sr-only">Password</span>
              <input
                ref={passwordInput}
                id="password"
                name="password"
                type="password"
                placeholder="Password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (fieldError?.field === "password") setFieldError(null);
                }}
                aria-invalid={fieldError?.field === "password"}
                aria-describedby={
                  fieldError?.field === "password"
                    ? "sign-in-field-error"
                    : undefined
                }
                readOnly={busy}
              />
            </label>
            {(fieldError || error) && (
              <p role="alert" id="sign-in-field-error" className="inline-error">
                {fieldError?.message || error}
              </p>
            )}
            <Button
              type="submit"
              name={
                submitting ? "Signing In…" : loading ? "Loading…" : "Sign In"
              }
              disabled={busy}
            />
          </form>
          <div className="account-links">
            <a className="link" href={cardsLink("user/?view=register")}>
              Create an Account
            </a>
            <a className="link" href={cardsLink("user/?view=recover")}>
              Forgot Password?
            </a>
            <a className="link" href={cardsLink("user/?view=resend")}>
              Resend Verification
            </a>
          </div>
        </div>
        <div className="button-stack">
          <MenuLink to="/" name="Home" />
        </div>
      </PageLayout>
    </>
  );
}
