import { DESCRIPTORS, FloatTy, IntTy, Season, StrTy, list, nn, nullTy } from "@ftc-scout/common";
import { GraphQLObjectType } from "graphql";
import { dataLoaderResolverList, dataLoaderResolverSingle } from "../utils";
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
            resolve: async (tep: TeamEventParticipation) => {
                let thisEvent = await Event.findOneBy({ season: tep.season, code: tep.eventCode });
                if (!thisEvent) return null;

                let descriptor = DESCRIPTORS[tep.season];
                let getOpr = (t: TeamEventParticipation) =>
                    descriptor.pensSubtract
                        ? t.opr?.totalPoints ?? null
                        : t.opr?.totalPointsNp ?? t.opr?.totalPoints ?? null;

                let candidates = await TeamEventParticipation[tep.season]
                    .createQueryBuilder("t")
                    .innerJoin(Event, "e", "e.season = t.season AND e.code = t.eventCode")
                    .where("t.teamNumber = :teamNumber", { teamNumber: tep.teamNumber })
                    .andWhere("t.eventCode <> :eventCode", { eventCode: tep.eventCode })
                    .andWhere("NOT t.isRemote")
                    .andWhere("t.hasStats")
                    .andWhere("NOT e.modified_rules")
                    .andWhere("e.start < :start", { start: thisEvent.start })
                    .getMany();

                let best = candidates
                    .map(getOpr)
                    .filter((v): v is number => v != null)
                    .reduce((a, b) => Math.max(a, b), -Infinity);

                return best === -Infinity ? null : best;
            },
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
