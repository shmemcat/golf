export const cardsHome =
  import.meta.env.VITE_CARDS_HOME_URL ||
  (import.meta.env.DEV ? "http://localhost:3000/" : "https://cards.shmem.dev/");
export const cardsLink = (path: string) =>
  new URL(path.replace(/^\//, ""), cardsHome).href;
