<script lang="ts" context="module">
    export function seasonFromUrl(url: URL): Season {
        let seasonName = url.searchParams.get("season");
        return ALL_SEASONS.find((s) => "" + s == seasonName) ?? CURRENT_SEASON;
    }

    export function overallFromUrl(url: URL): boolean {
        return url.searchParams.get("season") == "overall";
    }
</script>

<script lang="ts">
    import WidthProvider from "$lib/components/WidthProvider.svelte";
    import Card from "$lib/components/Card.svelte";
    import Loading from "$lib/components/Loading.svelte";
    import ErrorPage from "$lib/components/ErrorPage.svelte";
    import { page } from "$app/stores";
    import { prettyPrintURL } from "$lib/printers/url";
    import Location from "$lib/components/Location.svelte";
    import { eventSorter } from "$lib/util/sorters";
    import { prettyPrintDateRangeString } from "$lib/printers/dateRange";
    import TeamEventStats from "./TeamEventStats.svelte";
    import {
        ALL_SEASONS,
        CURRENT_SEASON,
        DESCRIPTORS,
        type Season,
        longestCommonPrefix,
    } from "@ftc-scout/common";
    import Award from "$lib/components/Award.svelte";
    import MatchTable from "$lib/components/matches/MatchTable.svelte";
    import SeasonSelect from "$lib/components/ui/form/SeasonSelect.svelte";
    import Form from "$lib/components/ui/form/Form.svelte";
    import type { Writable } from "svelte/store";
    import { queryParam } from "$lib/util/search-params/search-params";
    import Head from "$lib/components/Head.svelte";
    import { onDestroy, setContext, tick } from "svelte";
    import {
        SHOW_REMOTE_FOCUS_CTX,
        TEAM_CLICK_ACTION_CTX,
    } from "$lib/components/matches/MatchTeam.svelte";
    import FocusedTeam from "$lib/components/stats/FocusedTeam.svelte";
    import QuickStats from "./QuickStats.svelte";
    import OverallStats from "./OverallStats.svelte";
    import { goto } from "$app/navigation";
    import { browser } from "$app/environment";
    import { game, gameActive, setGamePageContext, setPendingHop, teamUrl, visitTeam, type Hop } from "$lib/game/game-store";
    import { Alliance, type FullMatchFragment } from "$lib/graphql/generated/graphql-operations";
    const toSeason = (n: number) => n as Season;

    export let data;

    $: teamStore = data.team;
    $: team = $teamStore?.data?.teamByNumber!;
    $: activeSeasons = team?.activeSeasons ?? [];
    $: inactiveSeasons = ALL_SEASONS.filter((s) => !activeSeasons.includes(s));

    $: sortedEvents = [...(team?.events ?? [])].sort(eventSorter);

    let season: Writable<Season | "overall"> = queryParam("season", {
        encode: (val) => (val == CURRENT_SEASON ? null : "" + val),
        decode: (val) =>
            val == "overall" ? val : ALL_SEASONS.find((s) => "" + s == val) ?? CURRENT_SEASON,
        pushState: true,
        killHash: true,
    });

    setContext(SHOW_REMOTE_FOCUS_CTX, false);

    let focused: { number: number; eventCode: string } | null = null;
    function hopTo(number: number, eventCode: string, match: FullMatchFragment | null): Hop | null {
        if (!match) return null;
        let events = sortedEvents.flatMap((tep) => [tep.event, ...(tep.event.relatedEvents ?? [])]);
        let mine = match.teams.find((t) => t.teamNumber == team.number);
        let theirs = match.teams.find((t) => t.teamNumber == number);
        let sameAlliance = mine?.alliance == theirs?.alliance;
        let hasAlliances = mine && theirs && mine.alliance != Alliance.Solo;
        return {
            eventName: events.find((e) => e.code == eventCode)?.name ?? eventCode,
            eventCode,
            season: match.season,
            match: match.description,
            relation: hasAlliances ? (sameAlliance ? "Partners" : "Opponents") : null,
        };
    }

    setContext(
        TEAM_CLICK_ACTION_CTX,
        (number: number, _name: string, eventCode: string, match: FullMatchFragment | null) => {
            if ($gameActive) {
                let hop = hopTo(number, eventCode, match);
                if (hop) setPendingHop(number, hop);
                let eventSeason = sortedEvents.find((tep) => tep.event.code == eventCode)?.event.season;
                goto(teamUrl(number, eventSeason ?? ($season == "overall" ? null : $season)));
                return;
            }

            let alreadyFocused = focused?.number == number && focused.eventCode == eventCode;
            focused = alreadyFocused ? null : { number, eventCode };
        }
    );
    $: if ($season || team?.number) focused = null;

    $: if (browser && team && team.number == +$page.params.number) {
        const url = $page.url.pathname + $page.url.search + $page.url.hash;
        visitTeam(team.number, team.name, url);
        setGamePageContext({
          number: team.number,
          url,
          events: sortedEvents.map(({ event }) => ({ season: event.season, code: event.code, name: event.name })),
        });
    }

    onDestroy(() => {
      if (browser) setGamePageContext(null);
    });

    $: crosshairHint = $game.lifelines.crosshair && $game.lifelines.crosshair.from === team?.number ? $game.lifelines.crosshair.event : null;
    $: if (browser && crosshairHint && sortedEvents.length && $page.url.hash === `#crosshair-${encodeURIComponent(crosshairHint.code)}`) {
      scrollToHint(crosshairHint.code);
    }

    async function scrollToHint(code: string) {
      await tick();
      document.getElementById(`crosshair-${code}`)?.scrollIntoView({ block: "start" });
    }

    $: focusedEvent = sortedEvents.find((tep) => tep.event.code == focused?.eventCode)?.event;
    $: focusedTeamData = [
        ...(focusedEvent?.teams ?? []),
        ...(focusedEvent?.relatedEvents ?? []).flatMap((re) => re.teams ?? []),
    ].find((t) => t.teamNumber == focused?.number);
</script>

<Head
    title={!!team ? `${team.number} ${team.name} | 2iLScout` : "Team Page | 2iLScout"}
    description={!!team
        ? `Information and matches for team ${team.number} ${team.name}.`
        : `Information and matches for team ${$page.params.number}`}
    image="https://api.ftcscout.org/banners/teams/{$page.params.number}"
    canonical={`/teams/${$page.params.number}`}
/>

<WidthProvider>
    <Loading store={$teamStore} checkExists={(t) => !!t.teamByNumber}>
        <ErrorPage slot="error" status={404} message="No team with number {$page.params.number}">
            (Try searching for teams on <a href="/teams">the teams page</a>)
        </ErrorPage>

        <Card vis={false}>
            <div class="header">
                <div class="identity">
                    <div class="title">
                        <h1>{team.name}</h1>
                        <span class="number">{team.number}</span>
                    </div>

                    <div class="meta">
                        <div class="meta-line">
                            <Location {...team.location} />
                            <span class="sep">&middot;</span>
                            <span>Rookie year {team.rookieYear}</span>
                        </div>
                        <div class="meta-line">
                            <span>{team.schoolName}</span>
                            {#if team.sponsors.length}
                                <span class="sep">&middot;</span>
                                <span>{team.sponsors.join(", ")}</span>
                            {/if}
                        </div>
                        {#if team.website}
                            <div class="meta-line">
                                <a href={team.website} target="_blank" rel="noreferrer">
                                    {prettyPrintURL(team.website)}
                                </a>
                            </div>
                        {/if}
                    </div>
                </div>

                <div class="actions">
                    <Form id="season" noscriptSubmit>
                        <SeasonSelect
                            bind:season={$season}
                            nonForm
                            includeOverall
                            disabledValues={inactiveSeasons}
                        />
                    </Form>
                </div>
            </div>
        </Card>

        {#if $season == "overall"}
            <OverallStats history={team.quickStatsHistory ?? []} />
        {:else}
            {#if focusedEvent && focusedTeamData}
                <FocusedTeam
                    team={focusedTeamData}
                    remote={focusedEvent.remote}
                    on:close={() => (focused = null)}
                />
            {/if}

            {#if team.quickStats}
                <QuickStats stats={team.quickStats} season={$season} />
            {/if}

            {#if sortedEvents.length}
                <Card vis={false} style="margin-bottom: 0">
                    <h2 class="section-title">Events</h2>
                </Card>
            {/if}

            {#each sortedEvents as tep}
                {@const event = tep.event}
                {@const hinted = crosshairHint && event.season === crosshairHint.season && (event.code === crosshairHint.code || event.relatedEvents?.some((related) => related.code === crosshairHint?.code))}
                {@const href = `/events/${event.season}/${event.code}/matches`}

                {@const isFinalsDivision = (() => {
                    if (!event || !event.relatedEvents || event.relatedEvents.length === 0)
                        return false;
                    const names = [event.name, ...event.relatedEvents.map((re) => re.name)];
                    const prefix = longestCommonPrefix(names);
                    const sliced = event.name.slice(prefix.length).trim().replace(/\-\s*/, "");
                    const mappedName = sliced.length === 0 ? "Finals Division" : sliced;
                    return mappedName === "Finals Division";
                })()}

                {@const matchTableTeams = isFinalsDivision
                    ? (event.relatedEvents ?? []).flatMap((re) =>
                          (re.teams ?? []).map((t) => ({
                              ...t,
                              teamNumber: t.team.number,
                              season: re.season,
                              eventCode: re.code,
                          }))
                      )
                    : event.teams ?? []}
                <Card panel style={`margin-top: var(--md-gap); ${hinted ? "outline: 2px solid var(--inline-theme-color); outline-offset: 3px;" : ""}`}>
                    <div class="event-head" class:hinted id={hinted && crosshairHint ? `crosshair-${crosshairHint.code}` : undefined}>
                        <h3 id={event.code}><a {href}>{event.name}</a></h3>

                        <div class="meta-line">
                            <span>{prettyPrintDateRangeString(event.start, event.end)}</span>
                            <span class="sep">&middot;</span>
                            <Location {...event.location} />
                        </div>

                        <TeamEventStats
                            stats={tep.stats}
                            season={toSeason(event.season)}
                            remote={event.remote}
                        />

                        {#if tep.awards.length}
                            <div>
                                {#each tep.awards as award, i}
                                    <Award
                                        {award}
                                        comma={i != tep.awards.length - 1}
                                        season={event.season}
                                    />
                                {/each}
                            </div>
                        {/if}
                    </div>

                    <MatchTable
                        matches={tep.matches.map((m) => m.match)}
                        allMatches={event.matches ?? []}
                        {event}
                        focusedTeam={focused?.eventCode == event.code ? focused.number : team.number}
                        eventTeams={matchTableTeams}
                    />
                </Card>
            {:else}
                <Card>
                    <div class="no-events">
                        <b>
                            {team.name}
                            {$season == CURRENT_SEASON ? "has not yet played" : "did not compete"} in
                            any
                            {DESCRIPTORS[$season].seasonName} events.
                        </b>
                        <p>Try choosing a different season from the dropdown menu.</p>
                    </div>
                </Card>
            {/each}
        {/if}
    </Loading>
</WidthProvider>

<style>
    .event-head.hinted {
      scroll-margin-top: calc(var(--hud-size) + 24px);
    }

    :global(#content.game .pred) {
        display: none;
    }

    .header {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: var(--lg-gap);
        flex-wrap: wrap;
        margin-top: var(--sm-gap);
    }

    .identity {
        display: flex;
        flex-direction: column;
        gap: var(--md-gap);
        min-width: 0;
    }

    .title {
        display: flex;
        align-items: baseline;
        flex-wrap: wrap;
        gap: 0 var(--md-gap);
    }

    h1 {
        margin: 0;
        font-size: var(--xl-font-size);
        font-weight: 600;
        line-height: 1.15;
    }

    .number {
        font-size: var(--lg-font-size);
        color: var(--text-color);
    }

    .meta {
        display: flex;
        flex-direction: column;
        gap: var(--sm-gap);

        font-size: 0.9em;
        color: var(--grayed-out-text-color);
    }

    .meta-line {
        display: flex;
        flex-wrap: wrap;
        align-items: baseline;
        gap: 0 var(--md-gap);
    }

    .meta :global(a),
    .event-head :global(.meta-line a) {
        color: inherit;
        text-decoration: underline;
        text-decoration-color: color-mix(in srgb, currentColor 65%, transparent);
        text-underline-offset: 2px;
    }

    .meta :global(a:hover) {
        color: var(--text-color);
        text-decoration-color: currentColor;
    }

    .actions {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: var(--md-gap);
    }

    @media (max-width: 550px) {
        .header,
        .section-title {
            padding-left: var(--md-pad);
        }
    }

    .section-title {
        margin: var(--sm-gap) 0 0;
        font-size: calc(var(--lg-font-size) * 1.4);
        font-weight: 600;
    }

    .event-head {
        display: flex;
        flex-direction: column;
        gap: var(--sm-gap);
        margin-bottom: var(--md-gap);
    }

    .event-head .meta-line {
        font-size: 0.9em;
        color: var(--grayed-out-text-color);
    }

    h3 {
        margin: 0;
        font-size: calc(var(--lg-font-size) * 1.1);
        font-weight: 600;
        line-height: 1.3;
    }

    h3 a {
        color: inherit;
    }

    .no-events {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: var(--md-gap);
        text-align: center;
    }
</style>
