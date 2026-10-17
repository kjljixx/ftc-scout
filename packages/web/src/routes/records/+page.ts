import { redirect } from "@sveltejs/kit";
import type { PageLoad } from "./$types";
import { get } from "svelte/store";
import { globalSeason } from "$lib/season-store";

export const load: PageLoad = async () => {
    throw redirect(307, `/records/${get(globalSeason)}/teams`);
};
