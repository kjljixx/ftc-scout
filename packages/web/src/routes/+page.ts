import { getClient } from "$lib/graphql/client";
import {
    EventPageDocument,
    HomePageDocument,
    TeamDocument,
} from "$lib/graphql/generated/graphql-operations";
import { getData } from "$lib/graphql/getData";
import { eventSorter } from "$lib/util/sorters";
import { CURRENT_SEASON, type Season, longestCommonPrefix } from "@ftc-scout/common";
import { get } from "svelte/store";
import type { PageLoad } from "./$types";

export const load: PageLoad = async ({ fetch, data }) => {
    let home = await getData(getClient(fetch), HomePageDocument, { season: CURRENT_SEASON });

    let homeTeam = data.homeTeam;
    if (!homeTeam) {
        return { home, homeTeam: null, latestSeason: null, latestEvent: null, teamMatches: null };
    }

    let teamData = await getData(getClient(fetch), TeamDocument, {
        number: homeTeam,
        season: CURRENT_SEASON,
    });

    let team = get(teamData)?.data?.teamByNumber;
    if (!team) {
        return { home, homeTeam, latestSeason: null, latestEvent: null, teamMatches: null };
    }

    const validSeasons = team.activeSeasons.filter((season) => season !== null) as number[];
    let latestSeason = (validSeasons.length ? Math.max(...validSeasons) : CURRENT_SEASON) as Season;

    if (latestSeason !== CURRENT_SEASON) {
        teamData = await getData(getClient(fetch), TeamDocument, {
            number: homeTeam,
            season: latestSeason,
        });
        team = get(teamData)?.data?.teamByNumber;
    }

    if (!team?.events.length) {
        return { home, homeTeam, latestSeason, latestEvent: null, teamMatches: null };
    }

    let allEventNames = team.events.map((e) => [e.event.name, ...e.event.relatedEvents.map((re) => re.name)]);
    let mainEventNames = allEventNames.map(longestCommonPrefix);
    function mapName(mainEventName: string, name: string): string {
      let sliced = name.slice(mainEventName.length).trim().replace(/\-\s*/, "");
      return sliced.length == 0 ? "Finals Division" : sliced;
    }

    let latestTep = [...team.events.filter((e, i) =>
      e.event.relatedEvents.length == 0 || mapName(mainEventNames[i], e.event.name) !== "Finals Division")
    ].sort(eventSorter)[0];
    let { event } = latestTep;

    let latestEvent = await getData(getClient(fetch), EventPageDocument, {
        season: event.season,
        code: event.code,
    });

    return {
        home,
        homeTeam,
        latestSeason,
        latestEvent,
        teamMatches: latestTep.matches.map((m) => m.match),
        teamName: team.name,
    };
};
