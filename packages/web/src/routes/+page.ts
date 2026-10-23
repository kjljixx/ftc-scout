import { getClient } from "$lib/graphql/client";
import {
    HomeEventDocument,
    HomePageDocument,
    HomeTeamDocument,
    HomeTeamMatchesDocument,
    type HomeEventQuery,
    type HomeEventQueryVariables,
} from "$lib/graphql/generated/graphql-operations";
import { getData } from "$lib/graphql/getData";
import { eventSorter } from "$lib/util/sorters";
import { type Season, longestCommonPrefix } from "@ftc-scout/common";
import { browser } from "$app/environment";
import type { ApolloClient, NormalizedCacheObject } from "@apollo/client";
import { get, readable, type Readable } from "svelte/store";
import { globalSeason, HOME_SEASON_DEPENDENCY } from "$lib/season-store";
import type { PageLoad } from "./$types";

export type HomeEventDetails = { data: HomeEventQuery | null } | null;

function logStep(step: string) {
    console.log(`[home load] ${Math.round(performance.now())}ms ${step}`);
}

function loadEventDetails(
    client: ApolloClient<NormalizedCacheObject>,
    variables: HomeEventQueryVariables
): Readable<HomeEventDetails> {
    const cachedData = browser
        ? client.readQuery<HomeEventQuery>({ query: HomeEventDocument, variables })
        : null;
    if (cachedData) return readable<HomeEventDetails>({ data: cachedData });

    let startMs = performance.now();
    logStep(`HomeEvent details start event=${variables.code}`);
    const details = client
        .query({ query: HomeEventDocument, variables })
        .then((res): HomeEventDetails => {
            logStep(
                `HomeEvent details loaded teams=${res.data.eventByCode?.teams.length ?? 0} matches=${
                    res.data.eventByCode?.matches.length ?? 0
                } ms=${Math.round(performance.now() - startMs)}`
            );
            return { data: res.data };
        })
        .catch((cause): HomeEventDetails => {
            console.error("[home load] HomeEvent details failed, only team matches shown", cause);
            return { data: null };
        });
    return readable<HomeEventDetails>(null, (set) => {
        details.then(set);
    });
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
            eventDetails: readable<HomeEventDetails>(null),
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
            eventDetails: readable<HomeEventDetails>(null),
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
            eventDetails: readable<HomeEventDetails>(null),
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

    let eventDetails = loadEventDetails(getClient(fetch), {
        season: event.season,
        code: event.code,
    });

    logStep(`HomeTeamMatches query start (${team.events.length} team events)`);
    let teamMatchesResult = await getClient(fetch).query({
        query: HomeTeamMatchesDocument,
        variables: { season: event.season, code: event.code, teamNumber: homeTeam },
    });

    logStep("HomeTeamMatches done");
    return {
        home: null,
        homeTeam,
        latestSeason,
        latestEvent: event,
        eventDetails,
        teamMatches: teamMatchesResult.data.eventByCode?.teamMatches.map((m) => m.match) ?? [],
        teamName: team.name,
    };
};
