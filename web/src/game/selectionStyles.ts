export const SELECTION_STYLES = [
  { id: "border", name: "Blush border", description: "A crisp 2px edge. Quiet and clear." },
  { id: "outline", name: "Spaced outline", description: "A thin outline with a little breathing room." },
  { id: "corners", name: "Corner marks", description: "Four small brackets leave the card edge open." },
  { id: "underline", name: "Bottom accent", description: "A blush stripe under each available card." },
  { id: "backing", name: "Soft backing", description: "Four seconds solid, then a slow fade out and back in." },
] as const;
export type SelectionStyle = (typeof SELECTION_STYLES)[number]["id"];
export function selectionStyle(value: string | null): SelectionStyle {
  return SELECTION_STYLES.find(style => style.id === value)?.id ?? "backing";
}
