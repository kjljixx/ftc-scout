import { browser } from "$app/environment";
import { get } from "svelte/store";
import { error } from "@sveltejs/kit";
import { DESCRIPTORS, Season } from "@ftc-scout/common";
import { getClient } from "$lib/graphql/client";
import { EventHeaderDocument } from "$lib/graphql/generated/graphql-operations";
import { getData } from "$lib/graphql/getData";
import type { LayoutLoad } from "./$types";

export const load: LayoutLoad = async ({ params, fetch }) => {
    let season = +params.season as Season;
    let args = { season, code: params.code };
    console.info(`[event-header] loading season=${season} code=${params.code}`);

    let header = await getData(getClient(fetch), EventHeaderDocument, args);

    if (!browser && !get(header)?.data?.eventByCode)
        throw error(404, `No ${DESCRIPTORS[season].seasonName} event with code ${params.code}`);

    return { header };
};
