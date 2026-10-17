import { getClient } from "$lib/graphql/client";
import {
    HomeEventDocument,
    HomePageDocument,
    HomeTeamDocument,
    HomeTeamMatchesDocument,
} from "$lib/graphql/generated/graphql-operations";
import { getData } from "$lib/graphql/getData";
import { eventSorter } from "$lib/util/sorters";
import { type Season, longestCommonPrefix } from "@ftc-scout/common";
import { get } from "svelte/store";
import { globalSeason, HOME_SEASON_DEPENDENCY } from "$lib/season-store";
import type { PageLoad } from "./$types";

function logStep(step: string) {
    console.log(`[home load] ${Math.round(performance.now())}ms ${step}`);
}

export const load: PageLoad = async ({ fetch, data, depends }) => {
    depends(HOME_SEASON_DEPENDENCY);
    let selectedSeason = get(globalSeason);
    logStep(`start homeTeam=${data.homeTeam} season=${selectedSeason}`);
    let loadHome = () => {
        logStep("HomePage query (landing page)");
        return getData(getClient(fetch), HomePageDocument, { season: selectedSeason });
    };

    let homeTeam = data.homeTeam;
    if (!homeTeam) {
        return {
            home: await loadHome(),
            homeTeam: null,
            latestSeason: null,
            latestEvent: null,
            teamMatches: null,
        };
    }

    logStep("Team query start");
    let teamResult = await getClient(fetch).query({
        query: HomeTeamDocument,
        variables: {
            number: homeTeam,
            season: selectedSeason,
        },
    });
    logStep("Team query done");

    let team = teamResult?.data?.teamByNumber;
    if (!team) {
        return {
            home: await loadHome(),
            homeTeam,
            latestSeason: null,
            latestEvent: null,
            teamMatches: null,
        };
    }

    const validSeasons = team.activeSeasons.filter((season) => season !== null) as number[];
    let latestSeason = (
        validSeasons.includes(selectedSeason)
            ? selectedSeason
            : validSeasons.length
            ? Math.max(...validSeasons)
            : selectedSeason
    ) as Season;

    if (latestSeason !== selectedSeason) {
        teamResult = await getClient(fetch).query({
            query: HomeTeamDocument,
            variables: {
                number: homeTeam,
                season: latestSeason,
            },
        });
        team = teamResult?.data?.teamByNumber;
    }

    if (!team?.events.length) {
        return {
            home: await loadHome(),
            homeTeam,
            latestSeason,
            latestEvent: null,
            teamMatches: null,
        };
    }

    let allEventNames = team.events.map((e) => [
        e.event.name,
        ...e.event.relatedEvents.map((re) => re.name),
    ]);
    let mainEventNames = allEventNames.map(longestCommonPrefix);
    function mapName(mainEventName: string, name: string): string {
        let sliced = name.slice(mainEventName.length).trim().replace(/\-\s*/, "");
        return sliced.length == 0 ? "Finals Division" : sliced;
    }

    let latestTep = [
        ...team.events.filter(
            (e, i) =>
                e.event.relatedEvents.length == 0 ||
                mapName(mainEventNames[i], e.event.name) !== "Finals Division"
        ),
    ].sort(eventSorter)[0];
    let { event } = latestTep;

    logStep(`HomeEvent query start (${team.events.length} team events)`);
    let [latestEvent, teamMatchesResult] = await Promise.all([
        getData(getClient(fetch), HomeEventDocument, {
            season: event.season,
            code: event.code,
        }),
        getClient(fetch).query({
            query: HomeTeamMatchesDocument,
            variables: { season: event.season, code: event.code, teamNumber: homeTeam },
        }),
    ]);

    logStep("HomeEvent done");
    return {
        home: null,
        homeTeam,
        latestSeason,
        latestEvent,
        teamMatches: teamMatchesResult.data.eventByCode?.teamMatches.map((m) => m.match) ?? [],
        teamName: team.name,
    };
};
