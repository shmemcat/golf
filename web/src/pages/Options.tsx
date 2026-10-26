import { TurnSoundOption } from "@/context/TurnSoundContext";
import { Helmet } from "react-helmet-async";
import { Navigate } from "react-router-dom";
import { PageLayout } from "@/components/ui/PageLayout";
import { MenuLink } from "@/components/Buttons";
import { useAuth } from "@/context/AuthContext";
import { CardBackOption } from "@/components/CardBackOption";
export default function Options() {
  const { user, loading } = useAuth();
  if (!user)
    return loading ? (
      <p role="status">Loading…</p>
    ) : (
      <Navigate to="/user" replace />
    );
  return <OptionsContent />;
}

export function OptionsContent() {
  return (
    <>
      <Helmet>
        <title>Options | Golf</title>
      </Helmet>
      <PageLayout title="OPTIONS">
        <CardBackOption />
        <TurnSoundOption />
        <div className="button-stack">
          <MenuLink to="/user" name="Back" />
          <MenuLink to="/" name="Home" />
        </div>
      </PageLayout>
    </>
  );
}
