<script lang="ts" context="module">
    import { get } from "svelte/store";
    import { globalSeason, parseSeason, teamInactiveSeasons } from "$lib/season-store";

    export function seasonFromUrl(url: URL): Season {
        return parseSeason(url.searchParams.get("season")) ?? get(globalSeason);
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
    import AdditionalInfo from "$lib/components/AdditionalInfo.svelte";
    import { eventSorter } from "$lib/util/sorters";
    import { prettyPrintDateRangeString } from "$lib/printers/dateRange";
    import TeamEventStats from "./TeamEventStats.svelte";
    import TeamEventContents from "./TeamEventContents.svelte";
    import {
        ALL_SEASONS,
        CURRENT_SEASON,
        DESCRIPTORS,
        type Season,
        isFinalsDivision,
    } from "@ftc-scout/common";
    import Award from "$lib/components/Award.svelte";
    import MatchTable from "$lib/components/matches/MatchTable.svelte";
    import { writable, type Writable } from "svelte/store";
    import { PRED_PENDING_CTX } from "$lib/components/matches/MatchScore.svelte";
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
    $: $teamInactiveSeasons = team
        ? ALL_SEASONS.filter((s) => !(team.activeSeasons ?? []).includes(s))
        : [];
    onDestroy(() => teamInactiveSeasons.set([]));

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

    let season: Writable<Season | "overall"> = queryParam("season", {
        encode: (val) => "" + val,
        decode: (val) => (val == "overall" ? val : parseSeason(val) ?? get(globalSeason)),
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

    function shiftTeamContent(node: HTMLElement) {
        let cards: HTMLElement[] = [];
        let frame = 0;
        let lastSummary = "";

        function scheduleLayout() {
            if (!frame) frame = requestAnimationFrame(updateLayout);
        }

        const resizeObserver = new ResizeObserver(scheduleLayout);

        function updateLayout() {
            frame = 0;
            const nextCards = [...node.querySelectorAll<HTMLElement>("[data-card]")].filter(
                (card) => !card.parentElement?.closest("[data-card]")
            );
            if (
                nextCards.length !== cards.length ||
                nextCards.some((card, i) => card !== cards[i])
            ) {
                cards = nextCards;
                resizeObserver.disconnect();
                resizeObserver.observe(node);
                cards.forEach((card) => resizeObserver.observe(card));
            }
            if (!cards.length) return;

            const requestedShift = Math.max(
                0,
                parseFloat(getComputedStyle(node).getPropertyValue("--team-content-shift")) || 0
            );
            const pageLeft = node.getBoundingClientRect().left;
            const availableShift = Math.max(
                0,
                Math.min(
                    ...cards.map((card) => {
                        const currentOffset = parseFloat(card.style.left) || 0;
                        const sideGap =
                            parseFloat(getComputedStyle(card).getPropertyValue("--side-gap")) || 0;
                        return (
                            card.getBoundingClientRect().left - currentOffset - pageLeft - sideGap
                        );
                    })
                )
            );
            const appliedShift = Math.min(requestedShift, availableShift);
            cards.forEach((card) => {
                const offset = `${-appliedShift}px`;
                if (card.style.left !== offset) card.style.left = offset;
            });
            node.dispatchEvent(new CustomEvent("team-layout-change", { bubbles: true }));

            const summary = `requested=${requestedShift}px applied=${appliedShift}px cards=${cards.length}`;
            if (summary !== lastSummary) {
                console.info(`[team-layout] ${summary}`);
                lastSummary = summary;
            }
        }

        const mutationObserver = new MutationObserver((records) => {
            if (
                records.some(
                    (record) =>
                        record.type === "childList" ||
                        record.target === node ||
                        (record.target as HTMLElement).hasAttribute("data-card")
                )
            ) {
                scheduleLayout();
            }
        });
        mutationObserver.observe(node, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ["style"],
        });
        resizeObserver.observe(node);
        scheduleLayout();

        return {
            destroy() {
                cancelAnimationFrame(frame);
                resizeObserver.disconnect();
                mutationObserver.disconnect();
            },
        };
    }
</script>

<Head
    title={!!team ? `${team.number} ${team.name} | 2iLScout` : "Team Page | 2iLScout"}
    description={!!team
        ? `Information and matches for team ${team.number} ${team.name}.`
        : `Information and matches for team ${$page.params.number}`}
    image="https://api.ftcscout.org/banners/teams/{$page.params.number}"
    canonical={`/teams/${$page.params.number}`}
/>

<div class="team-page" use:shiftTeamContent>
    <WidthProvider>
        <Loading store={$teamStore} checkExists={(t) => !!t.teamByNumber}>
            <ErrorPage
                slot="error"
                status={404}
                message="No team with number {$page.params.number}"
            >
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
                                {#if team.website}
                                    <span class="sep">&middot;</span>
                                    <a href={team.website} target="_blank" rel="noreferrer">
                                        {prettyPrintURL(team.website)}
                                    </a>
                                {/if}
                            </div>
                            <AdditionalInfo>
                                <div class="meta-line">
                                    <span>Rookie year {team.rookieYear}</span>
                                </div>
                                <div class="meta-line">
                                    <span>{team.schoolName}</span>
                                    {#if team.sponsors.length}
                                        <span class="sep">&middot;</span>
                                        <span>{team.sponsors.join(", ")}</span>
                                    {/if}
                                </div>
                            </AdditionalInfo>
                        </div>
                    </div>

                    <div class="actions">
                        <div class="view-switch" role="group" aria-label="Stats view">
                            <button
                                class:selected={$season != "overall"}
                                on:click={() => ($season = $globalSeason)}
                            >
                                Season
                            </button>
                            <button
                                class:selected={$season == "overall"}
                                on:click={() => ($season = "overall")}
                            >
                                Overall
                            </button>
                        </div>
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
                                id={hinted && crosshairHint
                                    ? `crosshair-${crosshairHint.code}`
                                    : undefined}
                            >
                                <h3 id={event.code} tabindex="-1"><a {href}>{event.name}</a></h3>

                                <div class="meta-line">
                                    <span>{prettyPrintDateRangeString(event.start, event.end)}</span
                                    >
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
                                    {$season == CURRENT_SEASON
                                        ? "has not yet played"
                                        : "did not compete"} in any
                                    {DESCRIPTORS[$season].seasonName} events.
                                </b>
                                <p>
                                    Try choosing a different season from the menu at the top of the
                                    page.
                                </p>
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
    </WidthProvider>
</div>

<style>
    .team-page {
        --team-content-shift: 64px;
    }

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

    .view-switch {
        display: inline-flex;
        gap: 2px;
        padding: 2px;

        background: var(--raised-bg-color);
        border-radius: 8px;
    }

    .view-switch button {
        padding: var(--md-pad) calc(var(--lg-pad) * 1.5);
        border: none;
        border-radius: 6px;

        background: transparent;
        color: var(--grayed-out-text-color);
        font: inherit;
        font-weight: 500;
        cursor: pointer;
    }

    .view-switch button:hover {
        background: var(--hover-color);
        color: var(--text-color);
    }

    .view-switch button.selected {
        background: var(--sep-color);
        color: var(--text-color);
        font-weight: 600;
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
