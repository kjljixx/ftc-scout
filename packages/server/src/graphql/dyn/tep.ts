import {
    DESCRIPTORS,
    Descriptor,
    FloatTy,
    IntTy,
    Season,
    nn,
    notEmpty,
    nullTy,
} from "@ftc-scout/common";
import { GraphQLFieldConfig, GraphQLObjectType, GraphQLResolveInfo } from "graphql";
import graphqlFields from "graphql-fields";
import { FindOptionsSelect, FindOptionsWhere } from "typeorm";
import { TeamEventParticipation } from "../../db/entities/dyn/team-event-participation";

const TEP_KEY_COLUMNS = ["season", "eventCode", "teamNumber", "isRemote", "hasStats"];
const TEP_SCALAR_STATS = [
    "rank",
    "rp",
    "tb1",
    "tb2",
    "wins",
    "losses",
    "ties",
    "dqs",
    "qualMatchesPlayed",
];
const TEP_STAT_GROUPS = ["tot", "avg", "min", "max", "dev", "opr", "oprSe"];

export function tepSelectFromInfos(season: Season, infos: GraphQLResolveInfo[]) {
    let dbNameByApiName = new Map(
        DESCRIPTORS[season].tepColumns().map((c) => [c.apiName, c.dbName])
    );
    let select: Record<string, any> = Object.fromEntries(TEP_KEY_COLUMNS.map((c) => [c, true]));

    for (let info of infos) {
        let stats = graphqlFields(info).stats ?? {};
        for (let [field, subFields] of Object.entries<any>(stats)) {
            if (TEP_SCALAR_STATS.includes(field)) {
                select[field] = true;
            } else if (TEP_STAT_GROUPS.includes(field)) {
                select[field] ??= {};
                for (let apiName of Object.keys(subFields)) {
                    let dbName = dbNameByApiName.get(apiName);
                    if (dbName) select[field][dbName] = true;
                }
            }
        }
    }

    return select as FindOptionsSelect<TeamEventParticipation>;
}

export function findTepsForRequest(
    season: Season,
    where: FindOptionsWhere<TeamEventParticipation>[],
    infos: GraphQLResolveInfo[]
) {
    return TeamEventParticipation[season].find({
        where,
        select: tepSelectFromInfos(season, infos),
    });
}

export function makeTepTypes(descriptor: Descriptor): GraphQLObjectType[] {
    let l = [make(descriptor, false), descriptor.hasRemote ? make(descriptor, true) : null];
    return l.filter(notEmpty);
}

export function addTypename(tep: TeamEventParticipation): TeamEventParticipation {
    let suffix = DESCRIPTORS[tep.season].typeSuffix(tep.isRemote);
    let __typename = `TeamEventStats${tep.season}${suffix}`;
    return { ...tep, __typename };
}

function make(descriptor: Descriptor, remote: boolean): GraphQLObjectType {
    let nameSuffix = descriptor.typeSuffix(remote);

    let innerFields = {} as Record<string, GraphQLFieldConfig<any, any>>;
    let stdErrFields = {} as Record<string, GraphQLFieldConfig<any, any>>;

    for (let c of descriptor.tepColumns()) {
        if (c.tradOnly && remote) continue;

        innerFields[c.apiName] = FloatTy;
        stdErrFields[c.apiName] = nullTy(FloatTy);
    }

    let inner = new GraphQLObjectType({
        name: `TeamEventStats${descriptor.season}${nameSuffix}Group`,
        fields: innerFields,
    });

    let stdErrInner = new GraphQLObjectType({
        name: `TeamEventStats${descriptor.season}${nameSuffix}StdErrGroup`,
        fields: stdErrFields,
    });

    let hasTb2 = descriptor.rankings.tb != "LosingScore";

    let outer = new GraphQLObjectType({
        name: `TeamEventStats${descriptor.season}${nameSuffix}`,
        fields: {
            rank: IntTy,
            rp: FloatTy,
            tb1: FloatTy,
            ...(hasTb2 ? { tb2: FloatTy } : {}),
            ...(!remote ? { wins: IntTy, losses: IntTy, ties: IntTy, dqs: IntTy } : {}),
            qualMatchesPlayed: IntTy,
            tot: { type: nn(inner) },
            avg: { type: nn(inner) },
            min: { type: nn(inner) },
            max: { type: nn(inner) },
            dev: { type: nn(inner) },
            opr: { type: nn(inner) },
            oprSe: { type: nn(stdErrInner) },
        },
    });

    return outer;
}
