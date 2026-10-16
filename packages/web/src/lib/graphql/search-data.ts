import type { ApolloQueryResult } from "@apollo/client";
import { CURRENT_SEASON } from "@ftc-scout/common";
import { getClient } from "./client";
import { CombinedSearchDocument, type CombinedSearchQuery } from "./generated/graphql-operations";

type SearchData = ApolloQueryResult<CombinedSearchQuery>;

let pending: Promise<SearchData> | null = null;

export function loadSearchData(): Promise<SearchData> {
    if (!pending) {
        console.debug(`[search-data] fetching combined search data (season ${CURRENT_SEASON})`);
        pending = getClient()
            .query({
                query: CombinedSearchDocument,
                variables: { season: CURRENT_SEASON },
                fetchPolicy: "no-cache",
            })
            .then((res) => {
                console.info(
                    `[search-data] loaded teams=${res.data.teamsSearch.length} events=${res.data.eventsSearch.length}`
                );
                return res;
            })
            .catch((cause) => {
                console.error("[search-data] load failed, next caller will retry", cause);
                pending = null;
                throw cause;
            });
    }
    return pending;
}
