import { GraphQLError, GraphQLFieldConfig, GraphQLObjectType } from "graphql";
import { IntTy, StrTy, nn } from "@ftc-scout/common";
import { Team } from "../../db/entities/Team";
import { PicklistTeam } from "../../db/entities/PicklistTeam";
import { findPicklistTeam, hashTeamToken, newTeamToken } from "../../picklist/team-token";
import { hitCount, recordHit } from "../../picklist/rate-limit";
import {
    FAILED_LOOKUPS_PER_HOUR,
    FAILED_LOOKUP_WINDOW_MS,
    GQLContext,
    failedLookupKey,
} from "../context";

const CREATES_PER_HOUR = 10;
const CREATE_WINDOW_MS = 60 * 60 * 1000;

const PicklistTeamGQL = new GraphQLObjectType({
    name: "PicklistTeam",
    fields: {
        teamNumber: IntTy,
        name: StrTy,
    },
});

const CreatedPicklistTeamGQL = new GraphQLObjectType({
    name: "CreatedPicklistTeam",
    fields: {
        token: StrTy,
        teamNumber: IntTy,
        name: StrTy,
    },
});

async function teamName(teamNumber: number): Promise<string> {
    let team = await Team.findOneBy({ number: teamNumber });
    return team?.name ?? "";
}

async function describe(picklistTeam: PicklistTeam) {
    return { teamNumber: picklistTeam.teamNumber, name: await teamName(picklistTeam.teamNumber) };
}

export const PicklistTeamQueries: Record<string, GraphQLFieldConfig<any, GQLContext>> = {
    picklistTeam: {
        type: PicklistTeamGQL,
        resolve: async (_, __, ctx) => {
            if (ctx.teamTokenRejected) {
                throw new GraphQLError("Unknown team link", {
                    extensions: { code: "UNKNOWN_TEAM" },
                });
            }
            return ctx.picklistTeam ? describe(ctx.picklistTeam) : null;
        },
    },
    picklistTeamByToken: {
        type: PicklistTeamGQL,
        args: { token: StrTy },
        resolve: async (_, { token }, ctx) => {
            if (hitCount(failedLookupKey(ctx.ip)) >= FAILED_LOOKUPS_PER_HOUR) return null;
            let picklistTeam = await findPicklistTeam(token);
            if (!picklistTeam) {
                let failures = recordHit(failedLookupKey(ctx.ip), FAILED_LOOKUP_WINDOW_MS);
                console.info(`[picklist] join lookup missed, ip=${ctx.ip} failures=${failures}`);
                return null;
            }
            return describe(picklistTeam);
        },
    },
};

export const PicklistTeamMutations: Record<string, GraphQLFieldConfig<any, GQLContext>> = {
    createPicklistTeam: {
        type: nn(CreatedPicklistTeamGQL),
        args: { teamNumber: IntTy },
        resolve: async (_, { teamNumber }, ctx) => {
            let creates = recordHit(`create-team:${ctx.ip}`, CREATE_WINDOW_MS);
            if (creates > CREATES_PER_HOUR) {
                console.warn(`[picklist] create rate limited, ip=${ctx.ip} creates=${creates}`);
                throw new GraphQLError("Too many teams created, try again later", {
                    extensions: { code: "RATE_LIMITED" },
                });
            }

            let team = await Team.findOneBy({ number: teamNumber });
            if (!team) {
                throw new GraphQLError(`No such team: ${teamNumber}`, {
                    extensions: { code: "BAD_USER_INPUT" },
                });
            }

            let token = newTeamToken();
            await PicklistTeam.create({
                tokenHash: hashTeamToken(token),
                teamNumber: team.number,
            }).save();
            console.info(`[picklist] team created, team=${team.number} ip=${ctx.ip}`);
            return { token, teamNumber: team.number, name: team.name };
        },
    },
};
