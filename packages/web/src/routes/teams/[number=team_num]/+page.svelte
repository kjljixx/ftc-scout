<script lang="ts" context="module">
    import { get } from "svelte/store";
    import { globalSeason, parseSeason } from "$lib/season-store";

    export function seasonFromUrl(url: URL): Season {
        return parseSeason(url.searchParams.get("season")) ?? get(globalSeason);
    }

    export function overallFromUrl(url: URL): boolean {
        return url.searchParams.get("season") == "overall";
    }
</script>

<script lang="ts">
    import Card from "$lib/components/Card.svelte";
    import Loading from "$lib/components/Loading.svelte";
    import { page } from "$app/stores";
    import Location from "$lib/components/Location.svelte";
    import { eventSorter } from "$lib/util/sorters";
    import { prettyPrintDateRangeString } from "$lib/printers/dateRange";
    import TeamEventStats from "./TeamEventStats.svelte";
    import TeamEventContents from "./TeamEventContents.svelte";
    import { CURRENT_SEASON, DESCRIPTORS, type Season, isFinalsDivision } from "@ftc-scout/common";
    import Award from "$lib/components/Award.svelte";
    import MatchTable from "$lib/components/matches/MatchTable.svelte";
    import { writable } from "svelte/store";
    import { PRED_PENDING_CTX } from "$lib/components/matches/MatchScore.svelte";
    import { getContext, onDestroy, setContext, tick } from "svelte";
    import {
        SHOW_REMOTE_FOCUS_CTX,
        TEAM_CLICK_ACTION_CTX,
    } from "$lib/components/matches/MatchTeam.svelte";
    import FocusedTeam from "$lib/components/stats/FocusedTeam.svelte";
    import { TEAM_SEASON_CTX, type TeamSeasonStore } from "./teamSeason";
    import QuickStats from "./QuickStats.svelte";
    import OverallStats from "./OverallStats.svelte";
    import { goto } from "$app/navigation";
    import { browser } from "$app/environment";
    import {
        game,
        gameActive,
        setGamePageContext,
        setPendingHop,
        teamUrl,
        visitTeam,
        type Hop,
    } from "$lib/game/game-store";
    import { tryHop } from "$lib/game/duel-store";
    import { Alliance, type FullMatchFragment } from "$lib/graphql/generated/graphql-operations";
    const toSeason = (n: number) => n as Season;

    export let data;

    $: teamStore = data.team;
    $: detailsStore = data.details;
    $: team = $teamStore?.data?.teamByNumber!;

    const predPending = writable(false);
    setContext(PRED_PENDING_CTX, predPending);
    $: $predPending = data.detailsExpected && !$detailsStore?.data;

    $: baseEvents = [...(team?.events ?? [])].sort(eventSorter);
    $: detailsByEvent = new Map(
        ($detailsStore?.data?.teamByNumber?.events ?? []).map((d) => [d.event.code, d.event])
    );
    $: sortedEvents = baseEvents.map((tep) => {
        let details = detailsByEvent.get(tep.event.code);
        return {
            ...tep,
            event: {
                ...tep.event,
                teams: details?.teams,
                matches: details?.matches as FullMatchFragment[] | undefined,
                relatedEvents: tep.event.relatedEvents?.map((related) => ({
                    ...related,
                    teams: details?.relatedEvents?.find((r) => r.code == related.code)?.teams,
                })),
            },
        };
    });

    const season: TeamSeasonStore = getContext(TEAM_SEASON_CTX);

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
        async (
            number: number,
            name: string,
            eventCode: string,
            match: FullMatchFragment | null
        ) => {
            if ($gameActive) {
                let hop = hopTo(number, eventCode, match);
                if (!(await tryHop(number, name, hop ?? undefined))) return;
                if (hop) setPendingHop(number, hop);
                let eventSeason = sortedEvents.find((tep) => tep.event.code == eventCode)?.event
                    .season;
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
            events: baseEvents.map(({ event }) => ({
                season: event.season,
                code: event.code,
                name: event.name,
            })),
        });
    }

    onDestroy(() => {
        if (browser) setGamePageContext(null);
    });

    $: crosshairHint =
        $game.lifelines.crosshair && $game.lifelines.crosshair.from === team?.number
            ? $game.lifelines.crosshair.event
            : null;
    $: if (
        browser &&
        crosshairHint &&
        sortedEvents.length &&
        $page.url.hash === `#crosshair-${encodeURIComponent(crosshairHint.code)}`
    ) {
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

<Loading store={$teamStore} checkExists={(t) => !!t.teamByNumber}>
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
            <QuickStats stats={team.quickStats} events={team.events ?? []} season={$season} />
        {/if}

        <div class="team-events">
            {#if sortedEvents.length}
                <Card vis={false} style="margin-bottom: 0">
                    <h2 class="section-title">Events</h2>
                </Card>
            {/if}

            {#each sortedEvents as tep}
                {@const event = tep.event}
                {@const hinted =
                    crosshairHint &&
                    event.season === crosshairHint.season &&
                    (event.code === crosshairHint.code ||
                        event.relatedEvents?.some(
                            (related) => related.code === crosshairHint?.code
                        ))}
                {@const href = `/events/${event.season}/${event.code}/matches`}

                {@const isEventFinalsDivision = isFinalsDivision(
                    event.name,
                    (event.relatedEvents ?? []).map((re) => re.name)
                )}

                {@const matchTableTeams = isEventFinalsDivision
                    ? (event.relatedEvents ?? []).flatMap((re) =>
                          (re.teams ?? []).map((t) => ({
                              ...t,
                              teamNumber: t.team.number,
                              season: re.season,
                              eventCode: re.code,
                          }))
                      )
                    : event.teams ?? []}
                <Card
                    panel
                    style={`margin-top: var(--md-gap); ${
                        hinted
                            ? "outline: 2px solid var(--inline-theme-color); outline-offset: 3px;"
                            : ""
                    }`}
                >
                    <div
                        class="event-head"
                        class:hinted
                        id={hinted && crosshairHint ? `crosshair-${crosshairHint.code}` : undefined}
                    >
                        <h3 id={event.code} tabindex="-1"><a {href}>{event.name}</a></h3>

                        <div class="meta-line">
                            <span>{prettyPrintDateRangeString(event.start, event.end)}</span>
                            <span class="sep">&middot;</span>
                            <Location {...event.location} />
                        </div>

                        {#if tep.stats || tep.awards.length}
                            <div class="performance">
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
                        {/if}
                    </div>

                    <MatchTable
                        matches={tep.matches.map((m) => m.match)}
                        allMatches={event.matches ?? []}
                        {event}
                        focusedTeam={focused?.eventCode == event.code
                            ? focused.number
                            : team.number}
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
                        <p>Try choosing a different season from the menu at the top of the page.</p>
                    </div>
                </Card>
            {/each}
            {#if baseEvents.length > 1}
                <TeamEventContents
                    events={baseEvents.map(({ event }) => ({
                        code: event.code,
                        name: event.name,
                        type: event.type,
                    }))}
                />
            {/if}
        </div>
    {/if}
</Loading>

<style>
    .team-events {
        position: relative;
        display: flow-root;
    }

    h3 {
        scroll-margin-top: 24px;
    }

    :global(#content.game) h3 {
        scroll-margin-top: calc(var(--hud-size) + 24px);
    }

    .event-head.hinted {
        scroll-margin-top: calc(var(--hud-size) + 24px);
    }

    :global(#content.game .pred) {
        display: none;
    }

    .meta-line {
        display: flex;
        flex-wrap: wrap;
        align-items: baseline;
        gap: 0 var(--md-gap);
    }

    .event-head :global(.meta-line a) {
        color: inherit;
        text-decoration: underline;
        text-decoration-color: color-mix(in srgb, currentColor 65%, transparent);
        text-underline-offset: 2px;
    }

    @media (max-width: 550px) {
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

    .performance {
        display: flex;
        flex-direction: column;
        gap: var(--sm-gap);
        margin-top: var(--lg-gap);
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
