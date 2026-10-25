export const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"] as const;
export const SUITS = ["S", "H", "C", "D"] as const;
export type Rank = (typeof RANKS)[number];
export type Suit = (typeof SUITS)[number];
export interface GolfCard { id: string; rank: Rank; suit: Suit }
export interface GridCard { card: GolfCard; faceUp: boolean }
export type DrawSource = "deck" | "discard";
export interface Player { cards: GridCard[]; score: number }
export interface Game {
  id: string;
  players: Player[];
  deck: GolfCard[];
  discard: GolfCard[];
  drawn: { card: GolfCard; source: DrawSource } | null;
  hole: number;
  starter: number;
  turn: number;
  phase: "opening" | "draw" | "replace" | "round-over" | "game-over";
  finalTurns: number[] | null;
  history: number[][];
}

export function shuffle<T>(cards: readonly T[], random = Math.random): T[] {
  const result = [...cards];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function deal(id: string, count: number, hole: number, starter: number, scores: number[], history: number[][]): Game {
  const deck = shuffle([0, 1].flatMap(deckIndex => SUITS.flatMap(suit =>
    RANKS.map(rank => ({ id: `${deckIndex}-${rank}${suit}`, rank, suit }))
  )));
  const players = Array.from({ length: count }, (_, seat) => ({ cards: [] as GridCard[], score: scores[seat] ?? 0 }));
  for (let card = 0; card < 6; card++) {
    for (const player of players) player.cards.push({ card: deck.pop()!, faceUp: false });
  }
  return { id, players, deck, discard: [], drawn: null, hole, starter, turn: starter, phase: "opening", finalTurns: null, history };
}

export function createGame(count: number): Game {
  if (!Number.isInteger(count) || count < 2 || count > 6) throw new Error("Choose two to six players.");
  return deal(crypto.randomUUID(), count, 1, Math.floor(Math.random() * count), [], []);
}

export function canOpen(game: Game, index: number): boolean {
  const cards = game.players[0].cards;
  const open = cards.flatMap((card, i) => card.faceUp ? [i] : []);
  return game.phase === "opening" && !!cards[index] && !cards[index].faceUp && open.length < 2 &&
    open.every(i => i % 3 !== index % 3);
}

export function openCard(game: Game, index: number): Game {
  if (!canOpen(game, index)) return game;
  return { ...game, players: game.players.map((player, seat) => seat ? player : {
    ...player, cards: player.cards.map((card, i) => i === index ? { ...card, faceUp: true } : card),
  }) };
}

export function openOpponents(game: Game): Game {
  if (game.phase !== "opening" || game.players[0].cards.filter(card => card.faceUp).length !== 2) return game;
  return { ...game, players: game.players.map((player, seat) => {
    if (!seat || player.cards.some(card => card.faceUp)) return player;
    const columns = shuffle([0, 1, 2]).slice(0, 2);
    const indices = columns.map(column => column + (Math.random() < 0.5 ? 0 : 3));
    return { ...player, cards: player.cards.map((card, index) => ({ ...card, faceUp: indices.includes(index) })) };
  }) };
}

export function turnUpDeck(game: Game): Game {
  if (game.phase !== "opening" || game.discard.length || game.players.some(player => player.cards.filter(card => card.faceUp).length !== 2)) return game;
  return { ...game, deck: game.deck.slice(0, -1), discard: [game.deck[game.deck.length - 1]] };
}

export function startPlay(game: Game): Game {
  return game.phase === "opening" && game.discard.length ? { ...game, phase: "draw" } : game;
}

export function cardValue(rank: Rank): number {
  if (rank === "K") return 0;
  if (rank === "A") return 1;
  if (rank === "2") return -2;
  return rank === "Q" || rank === "J" ? 10 : Number(rank);
}

export function scoreGrid(cards: readonly GridCard[]): number {
  const rank = (i: number) => cards[i].card.rank;
  const column = (i: number) => rank(i) === rank(i + 3) ? 0 : cardValue(rank(i)) + cardValue(rank(i + 3));
  // Overlapping 2×2 blocks share a column, so at most one block earns a bonus.
  for (const start of [0, 1]) {
    if ([start + 1, start + 3, start + 4].every(i => rank(i) === rank(start))) {
      return -20 + column(start === 0 ? 2 : 0);
    }
  }
  return column(0) + column(1) + column(2);
}

export function drawCard(game: Game, source: DrawSource): Game {
  if (game.phase !== "draw" || !game[source].length) return game;
  const pile = game[source];
  return { ...game, [source]: pile.slice(0, -1), drawn: { card: pile[pile.length - 1], source }, phase: "replace" };
}

function finishTurn(game: Game): Game {
  let finalTurns = game.finalTurns;
  if (finalTurns) finalTurns = finalTurns.filter(seat => seat !== game.turn);
  else if (game.players[game.turn].cards.every(card => card.faceUp)) {
    finalTurns = Array.from({ length: game.players.length - 1 }, (_, i) => (game.turn + 1 + i) % game.players.length);
  }
  if (finalTurns?.length === 0) {
    const scores = game.players.map(player => scoreGrid(player.cards));
    // The last final turn is immediately before the player who went out.
    const wentOut = (game.turn + 1) % game.players.length;
    if (scores.some(score => score < scores[wentOut])) scores[wentOut] += 10;
    return {
      ...game, drawn: null, finalTurns,
      phase: game.hole === 9 ? "game-over" : "round-over",
      history: [...game.history, scores],
      players: game.players.map((player, seat) => ({
        score: player.score + scores[seat], cards: player.cards.map(card => ({ ...card, faceUp: true })),
      })),
    };
  }
  let deck = game.deck;
  let discard = game.discard;
  if (!deck.length && discard.length > 1) {
    deck = shuffle(discard.slice(0, -1));
    discard = discard.slice(-1);
  }
  return { ...game, deck, discard, drawn: null, finalTurns, phase: "draw", turn: (game.turn + 1) % game.players.length };
}

export function replaceCard(game: Game, index: number): Game {
  if (game.phase !== "replace" || !game.drawn || !game.players[game.turn].cards[index]) return game;
  const drawn = game.drawn.card;
  const old = game.players[game.turn].cards[index].card;
  return finishTurn({ ...game, discard: [...game.discard, old], players: game.players.map((player, seat) => seat !== game.turn ? player : {
    ...player, cards: player.cards.map((card, i) => i === index ? { card: drawn, faceUp: true } : card),
  }) });
}

export function discardDraw(game: Game): Game {
  if (game.phase !== "replace" || game.drawn?.source !== "deck") return game;
  return finishTurn({ ...game, discard: [...game.discard, game.drawn.card] });
}

export function nextHole(game: Game): Game {
  if (game.phase !== "round-over") return game;
  return deal(game.id, game.players.length, game.hole + 1, (game.starter + 1) % game.players.length,
    game.players.map(player => player.score), game.history);
}

// Every bot uses the same policy. Unknown cards have the average value of a
// standard deck; their actual ranks are never inspected when choosing a move.
const UNKNOWN_CARD_VALUE = RANKS.reduce((sum, rank) => sum + cardValue(rank), 0) / RANKS.length;
function visibleGridValue(cards: readonly GridCard[]): number {
  const value = (cell: GridCard) => cell.faceUp ? cardValue(cell.card.rank) : UNKNOWN_CARD_VALUE;
  const column = (index: number) => {
    const top = cards[index];
    const bottom = cards[index + 3];
    return top.faceUp && bottom.faceUp && top.card.rank === bottom.card.rank ? 0 : value(top) + value(bottom);
  };
  for (const start of [0, 1]) {
    const first = cards[start];
    if (first.faceUp && [start + 1, start + 3, start + 4].every(index =>
      cards[index].faceUp && cards[index].card.rank === first.card.rank)) {
      return -20 + column(start === 0 ? 2 : 0);
    }
  }
  return column(0) + column(1) + column(2);
}

export function replacementIndex(game: Game, drawn: GolfCard): number {
  const cards = game.players[game.turn].cards;
  const before = visibleGridValue(cards);
  let best = 0;
  let bestGain = -Infinity;
  cards.forEach((cell, index) => {
    const after = cards.map((current, i) => i === index ? { card: drawn, faceUp: true } : current);
    const gain = before - visibleGridValue(after);
    // Prefer uncovering a card when two replacements have the same value.
    if (gain > bestGain + 1e-9 || (Math.abs(gain - bestGain) < 1e-9 && !cell.faceUp && cards[best].faceUp)) {
      best = index;
      bestGain = gain;
    }
  });
  // A discard-pile draw must be used, even if it cannot improve the board.
  return bestGain > 1e-9 || game.drawn?.source === "discard" ? best : -1;
}

export function botSource(game: Game): DrawSource {
  const top = game.discard[game.discard.length - 1];
  return top && (!game.deck.length || replacementIndex(game, top) >= 0) ? "discard" : "deck";
}
