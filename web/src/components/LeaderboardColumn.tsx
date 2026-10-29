import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { getProfileIcon } from "@/lib/profileIcons";
import styles from "@/styles/leaderboard.module.css";

type Player = {
   rank: number;
   username: string;
   profile_icon?: string | null;
};
export type LeaderboardEntry = Player & ({ games_won: number } | { achievement_count: number });

export function LeaderboardColumn({
   title,
   category,
   entries,
}: {
   title: string;
   category: string;
   entries: LeaderboardEntry[];
}) {
   return (
      <section className={styles.column} aria-label={`${title} leaderboard`}>
         <h2 className={styles.columnTitle}>{title}</h2>
         <table
            className={styles.table}
            aria-label={category === "achievements" ? "All-Time achievements leaderboard" : `${title} ${category} winners`}
         >
            <colgroup>
               <col className={styles.rankColumn} />
               <col />
               <col className={category === "achievements" ? styles.achievementsColumn : styles.winsColumn} />
            </colgroup>
            <thead className="sr-only">
               <tr>
                  <th scope="col">Rank</th>
                  <th scope="col">Player</th>
                  <th scope="col">{category === "achievements" ? "Achievements" : "Wins"}</th>
               </tr>
            </thead>
            <tbody>
               {entries.length ? (
                  entries.map((entry) => (
                     <tr key={entry.rank} className={styles.entry}>
                        <td className={styles.rank}>{entry.rank}</td>
                        <td className={styles.player}>
                           <div className={styles.playerContent}>
                              <span className={styles.icon} aria-hidden="true">
                                 <FontAwesomeIcon
                                    icon={getProfileIcon(entry.profile_icon)}
                                 />
                              </span>
                              <span
                                 className={styles.username}
                                 title={entry.username}
                              >
                                 {entry.username}
                              </span>
                           </div>
                        </td>
                        <td className={styles.wins}>
                           {"achievement_count" in entry
                              ? `${entry.achievement_count} ${entry.achievement_count === 1 ? "achievement" : "achievements"}`
                              : `${entry.games_won} ${entry.games_won === 1 ? "win" : "wins"}`}
                        </td>
                     </tr>
                  ))
               ) : (
                  <tr>
                     <td colSpan={3} className={styles.empty}>
                        {category === "achievements" ? "No achievements yet" : "No winners yet"}
                     </td>
                  </tr>
               )}
            </tbody>
         </table>
      </section>
   );
}
