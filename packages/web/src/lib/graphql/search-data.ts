import type { ApolloQueryResult } from "@apollo/client";
import type { Season } from "@ftc-scout/common";
import { get } from "svelte/store";
import { globalSeason } from "$lib/season-store";
import { getClient } from "./client";
import { CombinedSearchDocument, type CombinedSearchQuery } from "./generated/graphql-operations";

type SearchData = ApolloQueryResult<CombinedSearchQuery>;

const pendingBySeason = new Map<Season, Promise<SearchData>>();

export function loadSearchData(season: Season = get(globalSeason)): Promise<SearchData> {
    let pending = pendingBySeason.get(season);
    if (!pending) {
        console.debug(`[search-data] fetching combined search data (season ${season})`);
        pending = getClient()
            .query({
                query: CombinedSearchDocument,
                variables: { season },
                fetchPolicy: "no-cache",
            })
            .then((res) => {
                console.info(
                    `[search-data] loaded season=${season} teams=${res.data.teamsSearch.length} events=${res.data.eventsSearch.length}`
                );
                return res;
            })
            .catch((cause) => {
                console.error("[search-data] load failed, next caller will retry", cause);
                pendingBySeason.delete(season);
                throw cause;
            });
        pendingBySeason.set(season, pending);
    }
    return pending;
}
