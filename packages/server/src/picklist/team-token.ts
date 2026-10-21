import { createHash, randomBytes } from "crypto";
import { PicklistTeam } from "../db/entities/PicklistTeam";

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{22}$/;

export function newTeamToken(): string {
    return randomBytes(16).toString("base64url");
}

export function hashTeamToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
}

export async function findPicklistTeam(token: string): Promise<PicklistTeam | null> {
    if (!TOKEN_PATTERN.test(token)) return null;
    return PicklistTeam.findOneBy({ tokenHash: hashTeamToken(token) });
}
