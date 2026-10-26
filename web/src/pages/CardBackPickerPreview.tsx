import { OptionsContent } from "./Options";
import { CardBackPreviewProvider } from "@/context/CardBackContext";

export default function CardBackPickerPreview() {
  return <CardBackPreviewProvider><OptionsContent /></CardBackPreviewProvider>;
}
