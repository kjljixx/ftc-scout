import { IncomingMessage } from "http";
import { GraphQLError } from "graphql";
import { PicklistTeam } from "../db/entities/PicklistTeam";
import { findPicklistTeam } from "../picklist/team-token";
import { hitCount, recordHit } from "../picklist/rate-limit";

export const FAILED_LOOKUPS_PER_HOUR = 30;
export const FAILED_LOOKUP_WINDOW_MS = 60 * 60 * 1000;

export type GQLContext = {
    ip: string;
    picklistTeam: PicklistTeam | null;
    teamTokenRejected: boolean;
};

export function failedLookupKey(ip: string): string {
    return `failed-team-lookup:${ip}`;
}

export function clientIp(req: IncomingMessage): string {
    let forwarded = req.headers["x-forwarded-for"];
    let first = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(",")[0].trim();
    return first || req.socket.remoteAddress || "unknown";
}

export async function buildContext(req: IncomingMessage, token: unknown): Promise<GQLContext> {
    let ip = clientIp(req);
    if (typeof token != "string" || token == "") {
        return { ip, picklistTeam: null, teamTokenRejected: false };
    }

    if (hitCount(failedLookupKey(ip)) >= FAILED_LOOKUPS_PER_HOUR) {
        console.warn(`[picklist] team token lookup skipped, ip=${ip} is rate limited`);
        return { ip, picklistTeam: null, teamTokenRejected: true };
    }

    let picklistTeam = await findPicklistTeam(token);
    if (!picklistTeam) {
        let failures = recordHit(failedLookupKey(ip), FAILED_LOOKUP_WINDOW_MS);
        console.info(`[picklist] unknown team token, ip=${ip} failures=${failures}`);
        return { ip, picklistTeam: null, teamTokenRejected: true };
    }
    return { ip, picklistTeam, teamTokenRejected: false };
}

export function requirePicklistTeam(ctx: GQLContext): PicklistTeam {
    if (ctx.teamTokenRejected) {
        throw new GraphQLError("Unknown team link", { extensions: { code: "UNKNOWN_TEAM" } });
    }
    if (!ctx.picklistTeam) {
        throw new GraphQLError("Join a team to use the picklist", {
            extensions: { code: "NO_TEAM" },
        });
    }
    return ctx.picklistTeam;
}
