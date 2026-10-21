import { get } from "svelte/store";
import { getClient } from "$lib/graphql/client";
import {
    CreatePicklistTeamDocument,
    PicklistTeamDocument,
} from "$lib/graphql/generated/graphql-operations";
import { forgetTeam, setHomeTeamCookie, team, type JoinedTeam } from "./team-store";

export async function createTeam(teamNumber: number): Promise<JoinedTeam> {
    let result = await getClient().mutate({
        mutation: CreatePicklistTeamDocument,
        variables: { teamNumber },
    });
    let created = result.data?.createPicklistTeam;
    if (!created) throw new Error("The server did not return a team");
    let joined = { token: created.token, teamNumber: created.teamNumber, name: created.name };
    adoptTeam(joined);
    return joined;
}

export function adoptTeam(joined: JoinedTeam) {
    console.info(`[team] joined team ${joined.teamNumber}, home team set`);
    team.set(joined);
    setHomeTeamCookie(joined.teamNumber);
}

export function leaveTeam() {
    forgetTeam("user left the team");
}

export async function refreshTeam() {
    let current = get(team);
    if (!current) return;
    try {
        let result = await getClient().query({
            query: PicklistTeamDocument,
            fetchPolicy: "no-cache",
        });
        let fresh = result.data?.picklistTeam;
        if (!fresh) return forgetTeam("server returned no team for the stored link");
        if (fresh.name != current.name || fresh.teamNumber != current.teamNumber) {
            team.set({ ...current, teamNumber: fresh.teamNumber, name: fresh.name });
        }
        console.info(`[team] refreshed team ${fresh.teamNumber}`);
    } catch (error) {
        console.error("[team] refresh failed", error);
    }
}
