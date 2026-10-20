import { DESCRIPTORS, FloatTy, IntTy, Season, StrTy, list, nn, nullTy } from "@ftc-scout/common";
import { GraphQLObjectType } from "graphql";
import { dataLoaderResolver, dataLoaderResolverList, dataLoaderResolverSingle } from "../utils";
import { TeamEventParticipation } from "../../db/entities/dyn/team-event-participation";
import { In } from "typeorm";
import { Event } from "../../db/entities/Event";
import { DATA_SOURCE } from "../../db/data-source";
import { TeamGQL } from "./Team";
import { Team } from "../../db/entities/Team";
import { AwardGQL, teamAwareAwardLoader } from "./Award";
import { Award } from "../../db/entities/Award";
import { TeamMatchParticipation } from "../../db/entities/TeamMatchParticipation";
import { TepStatsUnionGQL } from "../dyn/dyn-types-schema";
import { addTypename } from "../dyn/tep";
import { EventGQL } from "./Event";
import { TeamMatchParticipationGQL } from "./TeamMatchParticipation";

type PreviousBestOprKey = { season: Season; eventCode: string; teamNumber: number };

export async function loadPreviousBestOprs(keys: PreviousBestOprKey[]): Promise<(number | null)[]> {
    let startMs = Date.now();
    let results: (number | null)[] = keys.map(() => null);

    let indexesBySeason = new Map<Season, number[]>();
    keys.forEach((k, i) =>
        indexesBySeason.set(k.season, [...(indexesBySeason.get(k.season) ?? []), i])
    );

    for (let [season, indexes] of indexesBySeason) {
        let oprColumn = DESCRIPTORS[season].pensSubtract
            ? "c.opr_total_points"
            : "COALESCE(c.opr_total_points_np, c.opr_total_points)";

        let rows: { team_number: number; event_code: string; best: number | null }[] =
            await DATA_SOURCE.query(
                `SELECT k.team_number, k.event_code, MAX(${oprColumn}) AS best
                 FROM unnest($1::int[], $2::varchar[]) AS k(team_number, event_code)
                 JOIN event cur ON cur.season = $3 AND cur.code = k.event_code
                 JOIN tep_${season} c ON c.team_number = k.team_number
                  AND c.event_code <> k.event_code
                  AND NOT c.is_remote
                  AND c.has_stats
                 JOIN event ce ON ce.season = $3 AND ce.code = c.event_code
                  AND NOT ce.modified_rules
                  AND ce.start < cur.start
                 GROUP BY k.team_number, k.event_code`,
                [
                    indexes.map((i) => keys[i].teamNumber),
                    indexes.map((i) => keys[i].eventCode),
                    season,
                ]
            );

        let bestByKey = new Map(rows.map((r) => [`${r.team_number}|${r.event_code}`, r.best]));
        for (let i of indexes) {
            let best = bestByKey.get(`${keys[i].teamNumber}|${keys[i].eventCode}`);
            results[i] = best == null ? null : +best;
        }
    }

    console.log(
        `[previousBestOpr] keys=${keys.length} seasons=${indexesBySeason.size} ms=${
            Date.now() - startMs
        }`
    );
    return results;
}

export const TeamEventParticipationGQL = new GraphQLObjectType({
    name: "TeamEventParticipation",
    fields: () => ({
        season: IntTy,
        eventCode: StrTy,
        teamNumber: IntTy,
        stats: {
            type: TepStatsUnionGQL,
            resolve: (tep) => (tep.hasStats ? addTypename(tep) : null),
        },

        previousBestOpr: {
            type: nullTy(FloatTy).type,
            resolve: dataLoaderResolver<
                TeamEventParticipation,
                number | null,
                PreviousBestOprKey,
                {},
                number | null
            >(
                (tep) => ({
                    season: tep.season,
                    eventCode: tep.eventCode,
                    teamNumber: tep.teamNumber,
                }),
                loadPreviousBestOprs,
                (_keys, results) => results
            ),
        },

        event: {
            type: nn(EventGQL),
            resolve: dataLoaderResolverSingle<
                TeamEventParticipation,
                Event,
                { season: Season; code: string }
            >(
                (tep) => ({ season: tep.season, code: tep.eventCode }),
                async (keys) => Event.find({ where: keys })
            ),
        },
        team: {
            type: nn(TeamGQL),
            resolve: dataLoaderResolverSingle<TeamEventParticipation, Team, number>(
                (tep) => tep.teamNumber,
                (keys) => Team.find({ where: { number: In(keys) } }),
                (k, t) => k == t.number
            ),
        },
        awards: {
            type: list(nn(AwardGQL)),
            resolve: dataLoaderResolverList<
                TeamEventParticipation,
                Award,
                { season: Season; eventCode: string; teamNumber: number }
            >(
                (tep) => ({
                    season: tep.season,
                    eventCode: tep.eventCode,
                    teamNumber: tep.teamNumber,
                }),
                teamAwareAwardLoader
            ),
        },
        matches: {
            type: list(nn(TeamMatchParticipationGQL)),
            resolve: dataLoaderResolverList<
                TeamEventParticipation,
                TeamMatchParticipation,
                { season: Season; eventCode: string; teamNumber: number }
            >(
                (tep) => ({
                    season: tep.season,
                    eventCode: tep.eventCode,
                    teamNumber: tep.teamNumber,
                }),
                (keys) => TeamMatchParticipation.find({ where: keys })
            ),
        },
    }),
});
