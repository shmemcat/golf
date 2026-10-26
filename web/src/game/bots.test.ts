import { describe, expect, it } from "vitest";
import scenarios from "../../../testdata/bot-decisions.json";
import { botSource, replacementIndex, type Game, type GolfCard, type Rank } from "./engine";

function scenarioGame(scenario: typeof scenarios[number]): Game {
  const card = (rank: string | null, id: string): GolfCard => ({ rank: rank as Rank, id, suit: "S" });
  return {
    id: "bot-test", hole: 1, history: [], starter: 0, turn: scenario.turn ?? 0, phase: "draw", drawn: null,
    finalTurns: scenario.finalTurns,
    players: scenario.boards.map((board, seat) => ({ score: 0,
      cards: board.map((rank, index) => ({ faceUp: rank !== null, card: card(rank, `${seat}-${index}`) })),
    })),
    deck: scenario.emptyDeck ? [] : [{ id: "unknown-deck-card" } as GolfCard],
    discard: scenario.discard.map((rank, index) => card(rank, `discard-${index}`)),
  };
}

describe("Public-information bot strategy", () => {
  it.each(scenarios)("$name (same policy as the server)", scenario => {
    const game = scenarioGame(scenario);
    const original = structuredClone(game);
    expect(botSource(game, scenario.botName)).toBe(scenario.expectedSource);
    expect(game).toEqual(original);
    if (scenario.drawSource === "discard") game.discard.pop();
    const card: GolfCard = { rank: scenario.drawRank as Rank, id: "drawn", suit: "H" };
    game.drawn = { card, source: scenario.drawSource as "deck" | "discard" };
    const before = structuredClone(game);
    expect(replacementIndex(game, card, scenario.botName)).toBe(scenario.expectedReplacement);
    expect(game).toEqual(before);
  });

  it.each([undefined, "Sunny"])("cannot inspect hidden cards or deck order (bot: %s)", botName => {
    const game = scenarioGame(scenarios[0]);
    const source = botSource(game, botName);
    const card: GolfCard = { rank: "K", id: "drawn", suit: "H" };
    game.drawn = { card, source: "deck" };
    const index = replacementIndex(game, card, botName);
    game.drawn = null;
    const hidden = new Proxy({} as GolfCard, { get() { throw new Error("Bots must never inspect a hidden card"); } });
    game.deck = [hidden, hidden];
    for (const player of game.players) for (const cell of player.cards) if (!cell.faceUp) cell.card = hidden;
    expect(botSource(game, botName)).toBe(source);
    game.drawn = { card, source: "deck" };
    expect(replacementIndex(game, card, botName)).toBe(index);
  });

  it.each(["Clover", "Birdie", "Maple", "Robin", "sunny"])("keeps %s on the regular strategy", botName => {
    const game = scenarioGame(scenarios.find(scenario => scenario.botName === "Sunny")!);
    expect(botSource(game, botName)).toBe("deck");
    expect(botSource(game, botName)).toBe(botSource(game));
    const card: GolfCard = { rank: "9", id: "drawn", suit: "H" };
    game.drawn = { card, source: "deck" };
    expect(replacementIndex(game, card, botName)).toBe(-1);
  });
});
