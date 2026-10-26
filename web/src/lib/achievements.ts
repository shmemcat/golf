import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import {
  faCardsBlank, faTrophy, faStars, faSnowflake, faBullseye, faFlag, faCrown, faUsers,
  faGolfBallTee, faDove, faFeatherPointed, faGolfFlagHole, faArrowsUpDown, faTree,
  faFlagCheckered, faSunBright, faChampagneGlasses, faCalendarHeart, faClover,
  faEgg, faSparkles, faGhost, faTurkey, faGift, faOwl, faVolumeXmark, faUserGroup,
  faFire, faCalendarDays, faDiceSix, faBolt,
} from "@fortawesome/pro-solid-svg-icons";
import { golfPost, type Statistics } from "./golfApi";

export const ACHIEVEMENT_EVENT = "golf:achievements";

export async function recordMusicOff(userId: string): Promise<void> {
  await golfPost("/achievements", { id: "geezer" }, userId);
  window.dispatchEvent(new Event(ACHIEVEMENT_EVENT));
}

export type Tier = "bronze" | "silver" | "gold";
export interface Achievement {
  id: string;
  name: string;
  desc: string;
  icon: IconDefinition;
  earned: boolean;
  secret?: boolean;
  tier?: Tier;
  progress?: string;
  next?: string;
}

const PLAY_TIERS = [
  { tier: "bronze", name: "Tee Time", target: 10 },
  { tier: "silver", name: "Green Jacket", target: 50 },
  { tier: "gold", name: "Tour Pro", target: 100 },
] as const;

const BADGES = [
  { id: "first_game", name: "Newcomer", desc: "Finish your first nine-hole game.", icon: faCardsBlank },
  { id: "first_win", name: "First Light", desc: "Win your first game. Shared wins count, too.", icon: faTrophy },
  { id: "ten_wins", name: "Written in the Stars", desc: "Win ten games.", icon: faStars },
  { id: "negative_hole", name: "Below Zero", desc: "Finish a hole with a negative score.", icon: faSnowflake },
  { id: "zero_hole", name: "Right on Target", desc: "Score exactly zero on a hole.", icon: faBullseye },
  { id: "negative_game", name: "Under Par", desc: "Finish all nine holes with a negative total.", icon: faFlag },
  { id: "flawless_nine", name: "Flawless Nine", desc: "Score zero or less on every hole in a game.", icon: faCrown },
  { id: "full_house", name: "Full House", desc: "Win a game with six players.", icon: faUsers, secret: true },
  { id: "birdie", name: "Birdie", desc: "Score exactly −1 on a hole.", icon: faDove },
  { id: "eagle", name: "Eagle", desc: "Score exactly −2 on a hole.", icon: faFeatherPointed },
  { id: "hole_in_one", name: "Hole in One", desc: "Finish a hole with all three columns matched.", icon: faGolfFlagHole },
  { id: "six_of_a_kind", name: "Six of a Kind", desc: "Finish a hole with all six board cards the same rank.", icon: faDiceSix },
  { id: "deuce_almighty", name: "Deuce Almighty", desc: "Finish a hole with a matching 2×2 block of twos.", icon: faBolt },
  { id: "up_and_down", name: "Up and Down", desc: "Follow a positive hole with a negative one in the same game.", icon: faArrowsUpDown },
  { id: "out_of_the_rough", name: "Out of the Rough", desc: "Win after starting the final hole in last place.", icon: faTree },
  { id: "photo_finish", name: "Photo Finish", desc: "Win outright by exactly one point.", icon: faFlagCheckered, secret: true },
  { id: "sunday_best", name: "Sunday Best", desc: "Finish a nine-hole game at −18 or better.", icon: faSunBright },
  { id: "better_with_friends", name: "Better with Friends", desc: "Finish a multiplayer game with at least two human players.", icon: faUserGroup, secret: true },
  { id: "hot_streak", name: "Hot Streak", desc: "Win five games in a row. Shared wins count, too.", icon: faFire, secret: true },
  { id: "night_owl", name: "Night Owl", desc: "Finish a game that began between midnight and 5 a.m.", icon: faOwl, secret: true },
  { id: "early_bird", name: "Early Bird", desc: "Finish a game that began between 5 and 8 a.m.", icon: faSunBright, secret: true },
  { id: "geezer", name: "Geezer", desc: "Turn the music off.", icon: faVolumeXmark, secret: true },
  { id: "all_year_round", name: "All Year Round", desc: "Collect all eight holiday achievements across any number of years.", icon: faCalendarDays, secret: true },
  { id: "new_year", name: "Auld Lang Syne", desc: "Play a game on New Year's Day.", icon: faChampagneGlasses, secret: true },
  { id: "lonely_heart", name: "Lonely Heart", desc: "Play a game on Valentine's Day.", icon: faCalendarHeart, secret: true },
  { id: "lucky_clover", name: "Lucky Clover", desc: "Play a game on St. Patrick's Day.", icon: faClover, secret: true },
  { id: "easter_egg", name: "Easter Egg", desc: "Play a game on Easter.", icon: faEgg, secret: true },
  { id: "fireworks", name: "Fireworks", desc: "Play a game on the 4th of July.", icon: faSparkles, secret: true },
  { id: "spooky", name: "Spooky", desc: "Play a game on Halloween.", icon: faGhost, secret: true },
  { id: "thankful", name: "Thankful", desc: "Play a game on Thanksgiving.", icon: faTurkey, secret: true },
  { id: "christmas_spirit", name: "Christmas Spirit", desc: "Play a game on Christmas.", icon: faGift, secret: true },
];

export function computeAchievements(stats?: Statistics): Achievement[] {
  const games = stats?.games_completed ?? 0;
  const current = PLAY_TIERS.findLast(level => games >= level.target);
  const next = PLAY_TIERS.find(level => games < level.target);
  const displayed = current ?? PLAY_TIERS[0];
  const progression: Achievement = {
    id: "golf_regular", name: displayed.name,
    desc: `Finish ${displayed.target} nine-hole games.`, icon: faGolfBallTee,
    earned: !!current, tier: current?.tier,
    progress: next ? `${games} / ${next.target} games finished` : `${games} games finished · Gold achieved`,
    next: next ? `Next: ${next.name} — Finish ${next.target} nine-hole games.` : undefined,
  };
  const badges = BADGES.map(badge => ({ ...badge, earned: !!stats?.achievements[badge.id] }));
  return [...badges.slice(0, 3), progression, ...badges.slice(3)];
}
