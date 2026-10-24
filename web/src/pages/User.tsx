import { useState, type FormEvent } from "react";
import { Helmet } from "react-helmet-async";
import { PageLayout } from "@/components/ui/PageLayout";
import { Button, MenuLink } from "@/components/Buttons";
import { useAuth } from "@/context/AuthContext";
import { ProfileIcon } from "@/components/ProfileIcon";
import { cardsLink } from "@/lib/links";

export default function User() {
  const { user, loading, error, login, logout } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (loading) return;
    await login(username.trim(), password);
    setPassword("");
  }
  return (
    <>
      <Helmet>
        <title>{user ? "Your Account" : "Sign In"} | Golf</title>
      </Helmet>
      <PageLayout title={user ? "ACCOUNT" : "SIGN IN"}>
        {user ? (
          <div className="account-body">
            <div className="account-avatar">
              <ProfileIcon name={user.profile_icon} />
            </div>
            <h2 className="account-name">{user.name}</h2>
            <p className="quiet-text">Your Cards account, at home on Golf.</p>
            <div className="button-stack">
              <MenuLink to="/profile" name="Profile" />
              <MenuLink to="/options" name="Options" />
              <Button
                name={loading ? "Signing Out…" : "Sign Out"}
                onClick={() => void logout()}
                disabled={loading}
              />
            </div>
            <a className="link" href={cardsLink("user/")}>
              Manage Account at Cards
            </a>
          </div>
        ) : (
          <div className="account-body">
            <p className="account-intro">
              One account for Golf, Hearts, Euchre, and Cards.
            </p>
            <form
              onSubmit={submit}
              className="signin-form"
              aria-label="Sign in"
              aria-busy={loading}
            >
              <label htmlFor="username">Username or Email</label>
              <input
                id="username"
                name="username"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={loading}
              />
              <label htmlFor="password">Password</label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
              />
              <Button
                type="submit"
                name={loading ? "Connecting…" : "Sign In"}
                disabled={loading}
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
        )}
        {error && (
          <p role="alert" className="inline-error">
            {error}
          </p>
        )}
        <div className="button-stack">
          {!user && <MenuLink to="/options" name="Options" />}
          <MenuLink to="/" name="Home" />
        </div>
      </PageLayout>
    </>
  );
}
