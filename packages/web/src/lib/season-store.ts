import { browser } from "$app/environment";
import { goto, invalidate } from "$app/navigation";
import { page } from "$app/stores";
import { ALL_SEASONS, CURRENT_SEASON, DESCRIPTORS, type Season } from "@ftc-scout/common";
import type { Page } from "@sveltejs/kit";
import { get, writable } from "svelte/store";
import { queryParamUrlKeeping } from "$lib/util/search-params/search-params";

const STORAGE_KEY = "season";
export const HOME_SEASON_DEPENDENCY = "app:season";

const EVENTS_LIST_ROUTE = "/events/[season=season]";
const EVENTS_PREFIX = "/events/[season=season]";
const RECORDS_PREFIX = "/records/[season=season]";
const TEAM_ROUTE = "/teams/[number=team_num]";

export function parseSeason(value: string | null | undefined): Season | null {
    return ALL_SEASONS.find((s) => "" + s == value) ?? null;
}

function storedSeason(): Season {
    let stored = browser ? parseSeason(localStorage.getItem(STORAGE_KEY)) : null;
    console.info(`[season] initial season=${stored ?? CURRENT_SEASON} stored=${stored}`);
    return stored ?? CURRENT_SEASON;
}

export const globalSeason = writable<Season>(storedSeason());

if (browser) {
    globalSeason.subscribe((season) => localStorage.setItem(STORAGE_KEY, "" + season));
}

export function seasonInPage($page: Page): Season | null {
    let routeId = $page.route.id ?? "";
    if (routeId.startsWith(EVENTS_PREFIX) || routeId.startsWith(RECORDS_PREFIX)) {
        return parseSeason($page.params.season);
    }
    if (routeId == TEAM_ROUTE) return parseSeason($page.url.searchParams.get("season"));
    return null;
}

export function syncSeasonFromPage($page: Page) {
    let season = seasonInPage($page);
    if (season != null && season != get(globalSeason)) {
        console.info(`[season] page ${$page.url.pathname} set season=${season}`);
        globalSeason.set(season);
    }
}

function seasonUrl(season: Season, $page: Page): string | null {
    let routeId = $page.route.id ?? "";

    if (routeId == EVENTS_LIST_ROUTE) return `/events/${season}${$page.url.search}`;
    if (routeId.startsWith(EVENTS_PREFIX)) return `/events/${season}`;

    if (routeId.startsWith(RECORDS_PREFIX)) {
        let toKeep = ["region", "type", "filter"];
        if (DESCRIPTORS[season].hasRemote) toKeep.push("remote");
        return `/records/${season}/${$page.params.tab}${queryParamUrlKeeping(toKeep)}`;
    }

    if (routeId == TEAM_ROUTE) {
        if ($page.url.searchParams.get("season") == "overall") return null;
        let query = new URLSearchParams($page.url.searchParams);
        query.set("season", "" + season);
        return `${$page.url.pathname}?${query}`;
    }

    return null;
}

export function changeSeason(season: Season) {
    console.info(`[season] navbar change season=${season}`);
    globalSeason.set(season);

    let $page = get(page);
    if ($page.route.id == "/") {
        invalidate(HOME_SEASON_DEPENDENCY);
        return;
    }

    let url = seasonUrl(season, $page);
    if (url) goto(url, { replaceState: false, keepFocus: true, noScroll: true });
}
