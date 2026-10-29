import { useState } from "react";
import { Helmet } from "react-helmet-async";
import { useNavigate } from "react-router-dom";
import { PageLayout } from "@/components/ui/PageLayout";
import { Button, MenuLink } from "@/components/Buttons";
import { AccountSummary } from "@/components/AccountSummary";
import {
  DangerButton,
  DeleteAccountModal,
} from "@/components/DeleteAccountModal";
import { useAuth } from "@/context/AuthContext";
import { clearResults } from "@/lib/results";

export function AccountDashboard() {
  const { user, loading, error, logout, deleteAccount } = useAuth();
  const [deleting, setDeleting] = useState(false);
  const navigate = useNavigate();
  if (!user) return null;
  return (
    <>
      <Helmet>
        <title>User | Golf</title>
      </Helmet>
      <PageLayout title="USER">
        <div className="account-dashboard">
          <h2 className="account-name">
            Welcome, <b>{user.name}</b>!
          </h2>
          <AccountSummary key={user.id} userId={user.id} />
          {error && (
            <p role="alert" className="inline-error">
              {error}
            </p>
          )}
          <div className="button-stack">
            <Button
              name={loading ? "Signing Out…" : "Sign Out"}
              disabled={loading}
              onClick={() => void logout()}
            />
            <MenuLink to="/" name="Home" />
          </div>
          <DangerButton
            name="Delete Account"
            disabled={loading}
            onClick={() => setDeleting(true)}
          />
          {deleting && (
            <DeleteAccountModal
              onClose={() => setDeleting(false)}
              onDelete={async (password) => {
                const result = await deleteAccount(password);
                clearResults(user.id);
                navigate("/user", {
                  replace: true,
                  state: { notice: result.message || "Account deleted." },
                });
              }}
            />
          )}
        </div>
      </PageLayout>
    </>
  );
}
