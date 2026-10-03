<script lang="ts" context="module">
    export const SHOW_MATCH_SCORE = {};
    export type ShowMatchFn = (match: FullMatchFragment) => void;
</script>

<script lang="ts">
    import { groupBy } from "@ftc-scout/common";
    import {
        TournamentLevel,
        type FullMatchFragment,
    } from "../../graphql/generated/graphql-operations";
    import { matchSorter } from "../../util/sorters";
    import RemoteMatchTableHeader from "./RemoteMatchTableHeader.svelte";
    import SectionRow from "./SectionRow.svelte";
    import TradMatchRow from "./TradMatchRow.svelte";
    import TradMatchTableHeader from "./TradMatchTableHeader.svelte";
    import RemoteMatches from "./RemoteMatches.svelte";
    import Bracket from "./Bracket.svelte";
    import { bracketLayoutFor } from "./bracket-layout";
    import { page } from "$app/stores";
    import ScoreModal from "./score-modal/ScoreModal.svelte";
    import { onMount, setContext, tick } from "svelte";
    import { queryParam } from "../../util/search-params/search-params";
    import { faHeart, faHeartBroken } from "@fortawesome/free-solid-svg-icons";
    import { faHeart as faHeartOutline } from "@fortawesome/free-regular-svg-icons";
    import Fa from "svelte-fa";

    export let matches: FullMatchFragment[];
    export let allMatches: FullMatchFragment[] = [];
    export let event: {
        season: number;
        code: string;
        started: boolean;
        published: boolean;
        timezone: string;
        remote: boolean;
        allianceCount?: number;
    };
    export let focusedTeam: number | null = null;
    export let showNonPenaltyScores = false;
    export let showHeartLegend = true;
    export let eventTeams: any[] = [];

    $: timeZone = event.timezone;
    $: remote = event.remote;
    $: eventCode = event.code;
    $: season = event.season;

    $: quals = matches.filter((m) => m.tournamentLevel == TournamentLevel.Quals).sort(matchSorter);
    $: semis = matches.filter((m) => m.tournamentLevel == TournamentLevel.Semis);
    $: finals = matches
        .filter((m) => m.tournamentLevel == TournamentLevel.Finals)
        .sort(matchSorter);
    $: doubleElim = matches.filter((m) => m.tournamentLevel == TournamentLevel.DoubleElim);

    $: soloMatches = groupBy(matches, (m) => m.id - (m.id % 1000));

    $: anySurrogate = matches.some((m) => m.teams.some((t) => t.surrogate));
    $: anyDq = matches.some((m) => m.teams.some((t) => t.dq));

    // Older events have no stored alliance count; their bracket size shows in the series numbers.
    function allianceCountFromSeries(ms: FullMatchFragment[]): number {
        let deSeries = ms
            .filter((m) => m.tournamentLevel == TournamentLevel.DoubleElim)
            .map((m) => m.series);
        let maxSeries = Math.max(0, ...deSeries);
        return maxSeries > 11 ? 8 : maxSeries > 7 ? 6 : maxSeries > 0 ? 4 : 0;
    }

    $: allianceCount =
        event.allianceCount || allianceCountFromSeries(allMatches.length ? allMatches : matches);
    $: teamCount = allianceCount > 6 ? 41 : allianceCount > 4 ? 40 : allianceCount > 0 ? 20 : 0;

    $: bracketLayout = bracketLayoutFor(allianceCount);
    $: bracketMatches = allMatches.filter((m) => m.tournamentLevel == TournamentLevel.DoubleElim);
    $: bracketAvailable = !remote && !!bracketLayout && bracketMatches.length > 0;
    let bracketView = false;
    $: showBracket = bracketView && bracketAvailable;

    const HEADER_HEIGHT = 40;
    let bracketRow: HTMLElement | null = null;
    let bracketPassed = false;

    function updateBracketPassed() {
        let content = document.getElementById("content");
        if (!content || !bracketRow) return;
        bracketPassed =
            bracketRow.getBoundingClientRect().bottom <=
            content.getBoundingClientRect().top + HEADER_HEIGHT;
    }

    $: if (showBracket) tick().then(updateBracketPassed);
    $: if (!showBracket) bracketPassed = false;

    onMount(() => {
        let content = document.getElementById("content");
        content?.addEventListener("scroll", updateBracketPassed, { passive: true });
        return () => content?.removeEventListener("scroll", updateBracketPassed);
    });

    let modalShown = false;
    let modalMatch: FullMatchFragment | null;

    function show(match: FullMatchFragment) {
        modalMatch = match;
        $modalMatchId = [match.eventCode, match.id];
        modalShown = true;
    }

    setContext(SHOW_MATCH_SCORE, show);

    let modalMatchId = queryParam<[string, number] | null>("scores", {
        encode: (m) => (m ? `${m[0]}-${m[1]}` : null),
        decode: (s) => {
            if (s == null) return null;
            let parts = s.split("-");
            return [parts[0], +parts[1]];
        },
        pushState: false,
    });
    if ($modalMatchId?.[0] == event.code) {
        let m = matches.find((m) => $modalMatchId?.[1] == m.id);
        if (m) show(m);
    }
</script>

<ScoreModal
    bind:shown={modalShown}
    bind:match={modalMatch}
    on:close={() => ($modalMatchId = null)}
/>

<table class:remote>
    {#if remote}
        <RemoteMatchTableHeader />
    {:else}
        <TradMatchTableHeader hidden={showBracket && !bracketPassed} />
    {/if}

    <tbody>
        {#if matches.some((m) => !!m.teams)}
            {#if event.remote}
                {#each Object.values(soloMatches).filter( (ms) => ms.some((m) => m.scores) ) as matches, i}
                    <RemoteMatches
                        {matches}
                        {eventCode}
                        {season}
                        {timeZone}
                        {focusedTeam}
                        zebraStripe={i % 2 == 1}
                    />
                {/each}
            {:else}
                {#if doubleElim.length}
                    <SectionRow name={"Playoffs"}>
                        {#if bracketAvailable}
                            <div class="view-toggle">
                                <button class:active={!bracketView} on:click={() => (bracketView = false)}>
                                    List
                                </button>
                                <button class:active={bracketView} on:click={() => (bracketView = true)}>
                                    Bracket
                                </button>
                            </div>
                        {/if}
                    </SectionRow>
                {/if}
                {#if showBracket && bracketLayout}
                    <tr class="bracket-row" bind:this={bracketRow}>
                        <td>
                            <Bracket
                                layout={bracketLayout}
                                matches={bracketMatches}
                                {allMatches}
                                {eventTeams}
                                {eventCode}
                                {season}
                                {focusedTeam}
                                {showNonPenaltyScores}
                            />
                        </td>
                    </tr>
                {:else}
                    {#each doubleElim as match}
                        <TradMatchRow
                            {match}
                            {allMatches}
                            {eventCode}
                            {season}
                            {timeZone}
                            {focusedTeam}
                            {teamCount}
                            {showNonPenaltyScores}
                            {eventTeams}
                        />
                    {/each}
                {/if}
                {#if finals.length}
                    <SectionRow name={"Finals"} />
                {/if}
                {#each finals as match}
                    <TradMatchRow
                        {match}
                        {allMatches}
                        {eventCode}
                        {season}
                        {timeZone}
                        {focusedTeam}
                        {showNonPenaltyScores}
                        {eventTeams}
                    />
                {/each}
                {#if semis.length}
                    <SectionRow name={"Semifinals"} />
                {/if}
                {#each semis as match}
                    <TradMatchRow
                        {match}
                        {allMatches}
                        {eventCode}
                        {season}
                        {timeZone}
                        {focusedTeam}
                        {showNonPenaltyScores}
                        {eventTeams}
                    />
                {/each}
                {#if quals.length && (finals.length || semis.length || doubleElim.length)}
                    <SectionRow name={"Qualification Matches"} />
                {/if}
                {#each quals as match}
                    <TradMatchRow
                        {match}
                        {allMatches}
                        {eventCode}
                        {season}
                        {timeZone}
                        {focusedTeam}
                        {showNonPenaltyScores}
                        {eventTeams}
                    />
                {/each}
            {/if}
        {:else if !event.started}
            <tr class="info">
                <td>This event has not yet begun.</td>
            </tr>
        {:else if event.published && $page.route.id?.startsWith("/teams")}
            <tr class="info">
                <td> This team did not play any matches at this event. </td>
            </tr>
        {:else}
            <tr class="info">
                <td> Matches have not yet been reported for this event. </td>
            </tr>
        {/if}
    </tbody>
</table>

{#if (anySurrogate || anyDq) && !event.remote}
    <div style:margin-top="var(--sm-gap)">
        {#if anySurrogate}
            <div>* Surrogate</div>
        {/if}
        {#if anyDq}
            <div style:text-decoration="line-through">Disqualified or No Show</div>
        {/if}
    </div>
{/if}

{#if showHeartLegend && doubleElim.length > 0}
    <div style:margin-top="var(--md-gap)" style="display: flex; gap: var(--vl-gap)">
        <div><Fa icon={faHeart} style="color: var(--red-team-color)" /> Elimination Remaining</div>
        <div>
            <Fa icon={faHeartBroken} style="color: var(--grayed-out-text-color)" /> Lost This Match
        </div>
        <div>
            <Fa icon={faHeartOutline} style="color: var(--grayed-out-text-color)" /> Lost Previous Match
        </div>
    </div>
{/if}

<style>
    table {
        display: block;

        --trad-match-cols: 4.5em 1fr 9.5em 1fr;
    }

    table.remote {
        border: 1px solid var(--sep-color);
        border-radius: 8px;
    }

    @media (max-width: 640px) {
        table {
            --trad-match-cols: 2.2em 1fr 6.5em 1fr;
        }
    }

    tbody {
        display: block;
    }

    table tbody :global(tr:last-child) {
        border-bottom-left-radius: 7px;
        border-bottom-right-radius: 7px;
    }
    table tbody :global(tr:last-child) :global(td:first-child) {
        border-bottom-left-radius: 7px;
    }
    table tbody :global(tr:last-child) :global(td:last-child) {
        border-bottom-right-radius: 7px;
    }

    .view-toggle {
        display: inline-flex;
        gap: 2px;
        padding: 2px;

        background: var(--bg-color);
        border-radius: 8px;
    }

    .view-toggle button {
        padding: var(--md-pad) calc(var(--lg-pad) * 1.5);
        border: 0;
        border-radius: 6px;
        background: transparent;

        color: var(--grayed-out-text-color);
        font: inherit;
        font-weight: 500;
        text-transform: none;
        letter-spacing: normal;
        cursor: pointer;
    }

    .view-toggle button:hover {
        background: var(--hover-color);
        color: var(--text-color);
    }

    .view-toggle button.active {
        background: var(--sep-color);
        color: var(--text-color);
        font-weight: 600;
    }

    .bracket-row,
    .bracket-row td {
        display: block;
    }

    .info {
        display: flex;
        align-items: center;
        justify-content: center;

        padding: var(--lg-pad);
    }

    .info td {
        display: block;
    }
</style>
