import { error } from "@sveltejs/kit";
import { getClient } from "$lib/graphql/client";
import { PicklistTeamByTokenDocument } from "$lib/graphql/generated/graphql-operations";
import type { PageLoad } from "./$types";

// The server rate limits failed token lookups by client IP, so look the token up from the browser.
export const ssr = false;

export const load: PageLoad = async ({ fetch, params }) => {
    let result = await getClient(fetch).query({
        query: PicklistTeamByTokenDocument,
        variables: { token: params.token },
        fetchPolicy: "no-cache",
    });
    let found = result.data?.picklistTeamByToken;
    console.info(`[join] token lookup ${found ? `found team ${found.teamNumber}` : "missed"}`);
    if (!found) throw error(404, "Not Found");
    return { token: params.token, teamNumber: found.teamNumber, name: found.name };
};
