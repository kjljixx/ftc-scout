import { browser } from "$app/environment";
import { get, readable, type Readable } from "svelte/store";
import type { ApolloClient, ApolloQueryResult, NormalizedCacheObject } from "@apollo/client";
import { getClient } from "$lib/graphql/client";
import {
    TeamDocument,
    TeamEventDetailsDocument,
    type TeamEventDetailsQuery,
    type TeamEventDetailsQueryVariables,
    type TeamQuery,
} from "$lib/graphql/generated/graphql-operations";
import { getData } from "$lib/graphql/getData";
import type { PageLoad } from "./$types";
import { error } from "@sveltejs/kit";
import { overallFromUrl, seasonFromUrl } from "./+page.svelte";
import { gameActive } from "$lib/game/game-store";

export type TeamEventDetails = { data: TeamEventDetailsQuery | null } | null;

function detailsAfter(
    client: ApolloClient<NormalizedCacheObject>,
    first: Readable<ApolloQueryResult<TeamQuery> | null>,
    variables: TeamEventDetailsQueryVariables
): Readable<TeamEventDetails> {
    return readable<TeamEventDetails>(null, (set) => {
        let started = false;
        return first.subscribe((result) => {
            if (started || !result?.data?.teamByNumber) return;
            started = true;

            let startMs = performance.now();
            console.info(
                `[team-details] loading team=${variables.number} season=${variables.season}`
            );
            client
                .query({
                    query: TeamEventDetailsDocument,
                    variables,
                    fetchPolicy: browser ? "cache-first" : "no-cache",
                })
                .then((res) => {
                    console.info(
                        `[team-details] loaded events=${
                            res.data.teamByNumber?.events?.length ?? 0
                        } ms=${Math.round(performance.now() - startMs)}`
                    );
                    set({ data: res.data });
                })
                .catch((cause) => {
                    console.error("[team-details] failed, predictions and bracket unavailable", cause);
                    set({ data: null });
                });
        });
    });
}

export const load: PageLoad = async ({ url, params, fetch }) => {
    let client = getClient(fetch);
    let number = +params.number;
    let season = seasonFromUrl(url);
    let overall = overallFromUrl(url);

    let teamData = await getData(client, TeamDocument, { number, season, overall });

    if (!browser && !get(teamData)?.data?.teamByNumber)
        throw error(404, `No team with number ${params.number}`);

    let detailsExpected = !overall && !get(gameActive);
    return {
        team: teamData,
        detailsExpected,
        details: detailsExpected
            ? detailsAfter(client, teamData, { number, season })
            : readable<TeamEventDetails>(null),
    };
};
