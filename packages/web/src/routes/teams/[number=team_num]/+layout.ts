import { browser } from "$app/environment";
import { get } from "svelte/store";
import { error } from "@sveltejs/kit";
import { getClient } from "$lib/graphql/client";
import { TeamHeaderDocument } from "$lib/graphql/generated/graphql-operations";
import { getData } from "$lib/graphql/getData";
import type { LayoutLoad } from "./$types";

export const load: LayoutLoad = async ({ params, fetch }) => {
    let number = +params.number;
    console.info(`[team-header] loading team=${number}`);

    let header = await getData(getClient(fetch), TeamHeaderDocument, { number });

    if (!browser && !get(header)?.data?.teamByNumber)
        throw error(404, `No team with number ${params.number}`);

    return { header };
};
