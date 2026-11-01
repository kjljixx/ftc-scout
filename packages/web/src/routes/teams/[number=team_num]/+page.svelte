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
    import SkulletReveal from "$lib/components/skeleton/SkulletReveal.svelte";
    import { page } from "$app/stores";
    import { eventSorter } from "$lib/util/sorters";
    import TeamEventContents from "./TeamEventContents.svelte";
    import TeamEventCard from "./TeamEventCard.svelte";
    import TeamEventsHeading from "./TeamEventsHeading.svelte";
    import TeamBodySkeleton from "./TeamBodySkeleton.svelte";
    import { CURRENT_SEASON, DESCRIPTORS, type Season } from "@ftc-scout/common";
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
    import OrangeBanners from "./OrangeBanners.svelte";
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

    let scrolledToHash: string | null = null;
    $: if (!$page.url.hash) scrolledToHash = null;
    $: if (browser && sortedEvents.length && $page.url.hash && $page.url.hash != scrolledToHash) {
        scrollToEventHash($page.url.hash);
    }

    async function scrollToEventHash(hash: string) {
        let code = decodeURIComponent(hash.slice(1));
        if (!sortedEvents.some((tep) => tep.event.code == code)) return;
        scrolledToHash = hash;
        await tick();
        document.getElementById(code)?.scrollIntoView({ block: "start" });
    }

    $: focusedEvent = sortedEvents.find((tep) => tep.event.code == focused?.eventCode)?.event;
    $: focusedTeamData = [
        ...(focusedEvent?.teams ?? []),
        ...(focusedEvent?.relatedEvents ?? []).flatMap((re) => re.teams ?? []),
    ].find((t) => t.teamNumber == focused?.number);
</script>

<Loading store={$teamStore} checkExists={(t) => !!t.teamByNumber}>
    <SkulletReveal slot="loading" label="Loading team stats">
        <TeamBodySkeleton />
    </SkulletReveal>
    {#if $season == "overall"}
        <OverallStats history={team.quickStatsHistory ?? []} />
        <OrangeBanners teamNumber={team.number} awards={team.awards ?? []} />
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
                <TeamEventsHeading />
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

                <TeamEventCard
                    {tep}
                    focusedTeam={focused?.eventCode == event.code ? focused.number : team.number}
                    hinted={!!hinted}
                    crosshairCode={crosshairHint?.code ?? null}
                />
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

    :global(#content.game .pred) {
        display: none;
    }

    .no-events {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: var(--md-gap);
        text-align: center;
    }
</style>
