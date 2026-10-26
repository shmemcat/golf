import { Helmet } from "react-helmet-async";
import { CardBackOption } from "@/components/CardBackOption";
import { PageLayout } from "@/components/ui/PageLayout";
import { MenuLink } from "@/components/Buttons";

export default function CardBacks() {
  return <>
    <Helmet><title>Card Backs | Golf</title></Helmet>
    <PageLayout title="CARD BACKS">
      <CardBackOption />
      <div className="button-stack"><MenuLink to="/game/single?players=6" name="Play with this design" /><MenuLink to="/options" name="Options" /></div>
    </PageLayout>
  </>;
}
