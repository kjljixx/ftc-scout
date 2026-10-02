import { DESCRIPTORS, FloatTy, IntTy, Season, StrTy, list, nn, nullTy } from "@ftc-scout/common";
import { GraphQLObjectType } from "graphql";
import { dataLoaderResolver, dataLoaderResolverList, dataLoaderResolverSingle } from "../utils";
import { TeamEventParticipation } from "../../db/entities/dyn/team-event-participation";
import { Event } from "../../db/entities/Event";
import { TeamGQL } from "./Team";
import { Team } from "../../db/entities/Team";
import { In } from "typeorm";
import { AwardGQL, teamAwareAwardLoader } from "./Award";
import { Award } from "../../db/entities/Award";
import { TeamMatchParticipation } from "../../db/entities/TeamMatchParticipation";
import { TepStatsUnionGQL } from "../dyn/dyn-types-schema";
import { addTypename } from "../dyn/tep";
import { EventGQL } from "./Event";
import { TeamMatchParticipationGQL } from "./TeamMatchParticipation";

type PreviousBestOprKey = { season: Season; eventCode: string; teamNumber: number };

async function loadPreviousBestOprs(keys: PreviousBestOprKey[]): Promise<(number | null)[]> {
    let startMs = Date.now();
    let results: (number | null)[] = keys.map(() => null);

    let indexesBySeason = new Map<Season, number[]>();
    keys.forEach((k, i) =>
        indexesBySeason.set(k.season, [...(indexesBySeason.get(k.season) ?? []), i])
    );

    for (let [season, indexes] of indexesBySeason) {
        let teamNumbers = [...new Set(indexes.map((i) => keys[i].teamNumber))];
        let candidates = await TeamEventParticipation[season]
            .createQueryBuilder("t")
            .where("t.teamNumber IN (:...teamNumbers)", { teamNumbers })
            .andWhere("NOT t.isRemote")
            .andWhere("t.hasStats")
            .getMany();

        let eventCodes = new Set([
            ...indexes.map((i) => keys[i].eventCode),
            ...candidates.map((c) => c.eventCode),
        ]);
        let events = await Event.findBy({ season, code: In([...eventCodes]) });
        let eventsByCode = new Map(events.map((e) => [e.code, e]));

        let candidatesByTeam = new Map<number, TeamEventParticipation[]>();
        for (let c of candidates) {
            candidatesByTeam.set(c.teamNumber, [...(candidatesByTeam.get(c.teamNumber) ?? []), c]);
        }

        let descriptor = DESCRIPTORS[season];
        let getOpr = (t: TeamEventParticipation) =>
            descriptor.pensSubtract
                ? t.opr?.totalPoints ?? null
                : t.opr?.totalPointsNp ?? t.opr?.totalPoints ?? null;

        for (let i of indexes) {
            let thisEvent = eventsByCode.get(keys[i].eventCode);
            if (!thisEvent) continue;

            let best = (candidatesByTeam.get(keys[i].teamNumber) ?? [])
                .filter((c) => {
                    let candidateEvent = eventsByCode.get(c.eventCode);
                    return (
                        c.eventCode != keys[i].eventCode &&
                        candidateEvent &&
                        !candidateEvent.modifiedRules &&
                        candidateEvent.start < thisEvent!.start
                    );
                })
                .map(getOpr)
                .filter((v): v is number => v != null)
                .reduce((a, b) => Math.max(a, b), -Infinity);

            results[i] = best === -Infinity ? null : best;
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
