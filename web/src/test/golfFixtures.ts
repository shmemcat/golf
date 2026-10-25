import type { AccountStatistics, Statistics, RoomState } from "@/lib/golfApi";
import { createGame } from "@/game/engine";

export function statsFixture(played = 0): Statistics {
  return { games_started: played, games_played: played, games_completed: played, games_won: played, games_lost: 0,
    games_abandoned: 0, win_rate: played ? 100 : 0, current_win_streak: played, best_win_streak: played,
    holes_played: played * 9, best_score: played ? -9 : null, worst_score: played ? -9 : null, average_score: played ? -9 : null,
    best_hole: played ? -1 : null, worst_hole: played ? -1 : null, negative_holes: played * 9, zero_holes: 0,
    pairs: 0, bonus_blocks: 0, shared_wins: 0, deck_draws: 0, discard_draws: 0, replacements: 0, discarded_draws: 0, cards_revealed: 0, autoplay_turns: 0,
    achievements: { first_game: played > 0, first_win: played > 0, negative_game: played > 0, negative_hole: played > 0 },
  };
}
export function statisticsFixture(bot = 0, multiplayer = 0): AccountStatistics {
  return { all_time: statsFixture(bot + multiplayer), bot: statsFixture(bot), multiplayer: statsFixture(multiplayer) };
}
export function roomFixture(count = 3, mySeat = 1): RoomState {
  const { deck, ...game } = createGame(count);
  return { code: "ABC234", mode: "multiplayer", capacity: count, revision: 4, mySeat, isHost: mySeat === 0,
    stage: "playing", motion: null, ready: [], rematchReady: [],
    seats: Array.from({ length: count }, (_, i) => ({ name: `Friend ${i}`, profileIcon: "cat", isBot: false, connected: true })),
    game: { ...game, phase: "draw", turn: 0, starter: 0, deckCount: deck.length, players: game.players.map(p => ({ ...p, cards: p.cards.map(c => ({ faceUp: false, card: { id: c.card.id } })) })) },
  };
}
