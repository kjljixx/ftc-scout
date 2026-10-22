import { GraphQLObjectType, GraphQLResolveInfo } from "graphql";
import {
    dataLoaderResolver,
    dataLoaderResolverSingle,
    keyListToWhereClause,
} from "../utils";
import { BoolTy, DateTimeTy, DESCRIPTORS, IntTy, StrTy, list, nn, nullTy } from "@ftc-scout/common";
import { Match } from "../../db/entities/Match";
import { Event } from "../../db/entities/Event";
import { MatchVideoTimestampGQL, eventVideosFor, videoTimestampsFor } from "./Timestamper";
import { TournamentLevelGQL } from "./enums";
import { Season } from "@ftc-scout/common";
import { MatchScoresUnionGQL } from "../dyn/dyn-types-schema";
import { frontendMSFromDB } from "../dyn/match-score";
import { DATA_SOURCE } from "../../db/data-source";
import graphqlFields from "graphql-fields";
import { EntityTarget, FindOptionsWhere, SelectQueryBuilder } from "typeorm";
import { TeamMatchParticipationGQL } from "./TeamMatchParticipation";
import { EventGQL } from "./Event";
import { TeamMatchParticipation } from "../../db/entities/TeamMatchParticipation";

export const MatchGQL: GraphQLObjectType = new GraphQLObjectType({
    name: "Match",
    fields: () => ({
        season: {
            ...IntTy,
            resolve: (m: Match) => m.eventSeason,
        },
        eventCode: StrTy,
        id: IntTy,
        hasBeenPlayed: BoolTy,
        scheduledStartTime: nullTy(DateTimeTy),
        actualStartTime: nullTy(DateTimeTy),
        postResultTime: nullTy(DateTimeTy),
        tournamentLevel: { type: nn(TournamentLevelGQL) },
        series: IntTy,
        matchNum: IntTy,
        description: StrTy,
        createdAt: DateTimeTy,
        updatedAt: DateTimeTy,

        // Must use aware loader
        scores: {
            type: MatchScoresUnionGQL,
            resolve: (m) => frontendMSFromDB(m.scores),
        },
        teams: { type: list(nn(TeamMatchParticipationGQL)) },

        videoTimestamps: {
            type: list(nn(MatchVideoTimestampGQL)),
            resolve: dataLoaderResolver(
                (m: Match) => ({
                    season: m.eventSeason,
                    eventCode: m.eventCode,
                    actualStartTime: m.actualStartTime,
                }),
                (keys) => eventVideosFor(keys),
                (keys, videos) => keys.map((k, i) => videoTimestampsFor(videos[i], k.actualStartTime))
            ),
        },

        event: {
            type: nn(EventGQL),
            resolve: dataLoaderResolverSingle<Match, Event, { season: Season; code: string }>(
                (m) => ({ season: m.eventSeason, code: m.eventCode }),
                (keys) => Event.find({ where: keys })
            ),
        },
    }),
});

const MATCH_FIELD_DEPENDENCIES: Record<string, string[]> = {
    season: ["eventSeason"],
    matchNum: ["id"],
    description: ["id", "tournamentLevel", "series"],
    videoTimestamps: ["actualStartTime"],
};
const TEAM_MATCH_FIELD_DEPENDENCIES: Record<string, string[]> = {
    team: ["teamNumber"],
};

function projectedColumns(
    target: EntityTarget<any>,
    requestedFields: string[],
    dependencies: Record<string, string[]> = {}
) {
    let requested = new Set(requestedFields.flatMap((f) => [f, ...(dependencies[f] ?? [])]));
    return DATA_SOURCE.getMetadata(target)
        .columns.filter((c) => c.isPrimary || requested.has(c.propertyName))
        .map((c) => c.propertyName);
}

function projectedScoreColumns(season: Season, scoreFields: Record<string, any>[]) {
    let requested = new Set(
        scoreFields.flatMap((f) => [
            ...Object.keys(f),
            ...Object.keys(f.red ?? {}),
            ...Object.keys(f.blue ?? {}),
        ])
    );
    let needed = DESCRIPTORS[season]
        .msColumns()
        .filter((c) => requested.has(c.getApiName(false)) || requested.has(c.getApiName(true)));
    if (needed.some((c) => c.outer)) return null;

    return projectedColumns(
        `match_score_${season}`,
        needed.map((c) => c.dbColName)
    );
}

function restrictAliasSelect(q: SelectQueryBuilder<any>, alias: string, columns: string[]) {
    q.expressionMap.selects = q.expressionMap.selects.filter((s) => s.selection != alias);
    q.addSelect(columns.map((c) => `${alias}.${c}`));
}

export async function singleSeasonScoreAwareMatchLoader<
    K extends { eventSeason: Season } & FindOptionsWhere<Match>
>(keys: K[], info: GraphQLResolveInfo[], includeScores = false, includeTeams = false) {
    let startMs = Date.now();
    let fields = info.map((i) => graphqlFields(i));
    includeScores ||= fields.some((f) => "scores" in f);
    includeTeams ||= fields.some((f) => "teams" in f);
    let season = keys[0].eventSeason;
    let project = fields.length > 0;
    let columnCounts = { match: 0, scores: 0, teams: 0 };

    let q = DATA_SOURCE.getRepository(Match)
        .createQueryBuilder("m")
        .where(keyListToWhereClause("m", keys));

    if (project) {
        let columns = projectedColumns(Match, fields.flatMap(Object.keys), MATCH_FIELD_DEPENDENCIES);
        columnCounts.match = columns.length;
        q.select(columns.map((c) => `m.${c}`));
    }

    if (includeScores) {
        q.leftJoinAndMapMany(
            "m.scores",
            `match_score_${season}`,
            "ms",
            "m.event_season = ms.season AND m.event_code = ms.event_code AND m.id = ms.match_id"
        );
        let columns = project && projectedScoreColumns(season, fields.map((f) => f.scores ?? {}));
        if (columns) {
            columnCounts.scores = columns.length;
            restrictAliasSelect(q, "ms", columns);
        }
    }
    if (includeTeams) {
        q.leftJoinAndMapMany(
            "m.teams",
            "team_match_participation",
            "tmp",
            "m.event_season = tmp.season AND m.event_code = tmp.event_code AND m.id = tmp.match_id"
        );
        if (project) {
            let columns = projectedColumns(
                TeamMatchParticipation,
                fields.flatMap((f) => Object.keys(f.teams ?? {})),
                TEAM_MATCH_FIELD_DEPENDENCIES
            );
            columnCounts.teams = columns.length;
            restrictAliasSelect(q, "tmp", columns);
        }
    }

    let matches = await q.getMany();
    console.log(
        `[matchLoader] season=${season} keys=${keys.length} matches=${matches.length} projected=${project} columns=${JSON.stringify(columnCounts)} ms=${Date.now() - startMs}`
    );
    return matches;
}
