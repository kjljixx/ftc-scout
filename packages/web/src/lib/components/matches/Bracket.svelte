<script lang="ts">
    import { getContext } from "svelte";
    import { Alliance, type FullMatchFragment } from "../../graphql/generated/graphql-operations";
    import { sortTeams } from "../../util/sorters";
    import type { BracketLayout, BracketSeries, Slot } from "./bracket-layout";
    import { predictScores } from "./match-prediction";
    import { computeWinner, scoreValue } from "./MatchScore.svelte";
    import { SHOW_MATCH_SCORE, type ShowMatchFn } from "./MatchTable.svelte";
    import MatchTeam from "./MatchTeam.svelte";
    import { allianceColorStyle, type AllianceSeeds } from "./alliance-colors";

    export let seeds: AllianceSeeds | null = null;
    export let layout: BracketLayout;
    export let matches: FullMatchFragment[];
    export let allMatches: FullMatchFragment[] = [];
    export let eventTeams: any[] = [];
    export let eventCode: string;
    export let season: number;
    export let focusedTeam: number | null;
    export let showNonPenaltyScores = false;

    const BOX_WIDTH = 184;
    const BASE_BOX_HEIGHT = 172;
    const PHONE_TEAMS_HEIGHT_PER_TEXT_SCALE = 58;
    const BASE_TEXT_SCALE = 0.85;
    const COLUMN_GAP = 26;
    const ROW_GAP = 10;
    const MIN_SCALE = 0.65;
    const PHONE_WIDTH = 640;
    const BOX_PADDING = 4;
    const ROW_MARGIN = 2;
    const PHONE_ROW_MARGIN = 6;
    const PHONE_RED_PAD_BOTTOM = 3;
    const ALLIANCES = [Alliance.Red, Alliance.Blue];

    let show: ShowMatchFn = getContext(SHOW_MATCH_SCORE);

    $: latestBySeries = matches.reduce((acc, m) => {
        if (!acc[m.series] || acc[m.series].matchNum < m.matchNum) acc[m.series] = m;
        return acc;
    }, {} as Record<number, FullMatchFragment>);

    $: placed = layout.series.filter((s) => s.series != layout.reset || latestBySeries[s.series]);

    let availableWidth = 0;

    const left = (s: BracketSeries) => s.col * (BOX_WIDTH + COLUMN_GAP);
    $: width = Math.max(...placed.map(left)) + BOX_WIDTH;
    $: scale = availableWidth ? Math.max(MIN_SCALE, Math.min(1, availableWidth / width)) : 1;

    $: isPhone = availableWidth > 0 && availableWidth < PHONE_WIDTH;
    $: textScale = isPhone ? 1 / scale : BASE_TEXT_SCALE;
    $: rowMargin = isPhone ? PHONE_ROW_MARGIN : ROW_MARGIN;
    $: boxHeight = isPhone
        ? ALLIANCES.length * (PHONE_TEAMS_HEIGHT_PER_TEXT_SCALE * textScale + rowMargin) +
          2 * BOX_PADDING
        : BASE_BOX_HEIGHT;

    $: top = (s: BracketSeries) => s.row * (boxHeight + ROW_GAP);
    $: height = Math.max(...placed.map(top)) + boxHeight;

    $: rowCenter = (s: BracketSeries, row: number | null): number => {
        if (row == null) return top(s) + boxHeight / 2;
        let rowHeight = (boxHeight - 2 * BOX_PADDING) / ALLIANCES.length;
        return top(s) + BOX_PADDING + row * rowHeight + (rowHeight - rowMargin) / 2;
    };

    $: linkPath = (from: BracketSeries, to: BracketSeries): string => {
        let fromMatch = latestBySeries[from.series];
        let toMatch = latestBySeries[to.series];
        let winner = fromMatch && computeWinner(fromMatch.scores);
        let winnerRow = ALLIANCES.findIndex((a) => a == winner);
        let advancing =
            winnerRow < 0 ? [] : rosterOf(fromMatch, ALLIANCES[winnerRow]).map((t) => t.teamNumber);
        let advancingRow = toMatch
            ? ALLIANCES.findIndex((a) =>
                  rosterOf(toMatch, a).some((t) => advancing.includes(t.teamNumber))
              )
            : -1;

        let startX = left(from) + BOX_WIDTH;
        let startY = rowCenter(from, winnerRow < 0 ? null : winnerRow);
        let endX = left(to);
        let endY = rowCenter(to, advancingRow < 0 ? null : advancingRow);
        let bendX = endX - COLUMN_GAP / 2;
        return `M${startX} ${startY} H${bendX} V${endY} H${endX}`;
    };

    $: linkStyle = (from: BracketSeries): string | null => {
        let match = latestBySeries[from.series];
        let winner = match && computeWinner(match.scores);
        let advancing = winner == Alliance.Red || winner == Alliance.Blue ? winner : null;
        return match && advancing ? allianceColorStyle(seeds, match, advancing) : null;
    };

    $: links = placed.flatMap((to) =>
        to.slots.flatMap((slot) => {
            let from = slot?.kind == "winner" && placed.find((s) => s.series == slot.from);
            return from ? [{ d: linkPath(from, to), style: linkStyle(from) }] : [];
        })
    );

    function slotLabel(slot: Slot): string {
        if (!slot) return "TBD";
        return `${slot.kind == "winner" ? "Winner" : "Loser"} of M-${slot.from}`;
    }

    function rosterOf(match: FullMatchFragment, alliance: Alliance) {
        let teams = match.teams.filter((t) => t.alliance == alliance);
        return (teams.length > 2 ? teams.filter((t) => t.onField) : teams).sort(sortTeams);
    }

    function rowsOf(match: FullMatchFragment) {
        let winner = computeWinner(match.scores);
        let pred = predictScores(match, allMatches, eventTeams);
        let scores = match.scores && "red" in match.scores ? match.scores : null;
        return ALLIANCES.map((alliance) => {
            let red = alliance == Alliance.Red;
            let own = red ? pred.red : pred.blue;
            let other = red ? pred.blue : pred.red;
            return {
                alliance,
                colorStyle: allianceColorStyle(seeds, match, alliance),
                teams: rosterOf(match, alliance),
                won: winner == alliance,
                lost: winner != null && winner != alliance && winner != "Tie",
                tie: winner == "Tie",
                score: scores
                    ? scoreValue(red ? scores.red : scores.blue, showNonPenaltyScores)
                    : null,
                pred: own,
                predStrong: own >= other,
            };
        });
    }
</script>

<div
    class="scroller"
    bind:clientWidth={availableWidth}
    style:--text-scale={textScale}
    style:--compact-pad-y={isPhone ? "0px" : "2px"}
    style:--row-margin="{isPhone ? rowMargin - PHONE_RED_PAD_BOTTOM : rowMargin}px"
    style:--red-pad-bottom="{isPhone ? PHONE_RED_PAD_BOTTOM : 0}px"
>
    <div
        class="bracket"
        style:width="{width}px"
        style:height="{height}px"
        style:zoom={scale}
        style:--scale={scale}
    >
        <svg {width} {height}>
            {#each links as link}
                <path d={link.d} class:alliance-colored={!!link.style} style={link.style} />
            {/each}
        </svg>

        {#each placed as s (s.series)}
            {@const match = latestBySeries[s.series]}
            <div
                class="series"
                class:placeholder={!match}
                style:left="{left(s)}px"
                style:top="{top(s)}px"
                style:width="{BOX_WIDTH}px"
                style:height="{boxHeight}px"
            >
                {#if match}
                    {#each rowsOf(match) as row}
                        <div
                            class="alliance"
                            class:red={row.alliance == Alliance.Red}
                            class:blue={row.alliance == Alliance.Blue}
                            class:lost={row.lost}
                            class:alliance-colored={!!row.colorStyle}
                            style={row.colorStyle}
                        >
                            <div class="teams">
                                <table>
                                    <tbody>
                                        <tr>
                                            {#each row.teams as team}
                                                <MatchTeam
                                                    {team}
                                                    {eventCode}
                                                    {season}
                                                    {focusedTeam}
                                                    winner={row.won}
                                                    span={1}
                                                    trad
                                                    compact
                                                    tinted={!!row.colorStyle && row.lost}
                                                />
                                            {/each}
                                        </tr>
                                    </tbody>
                                </table>
                            </div>

                            <button
                                class="numbers"
                                class:hasScores={row.score != null}
                                class:unplayed={row.score == null}
                                disabled={row.score == null}
                                on:click={() => show(match)}
                            >
                                {#if row.score != null}
                                    <span
                                        class="score"
                                        class:winner={row.won}
                                        class:red={row.alliance == Alliance.Red}
                                        class:blue={row.alliance == Alliance.Blue}
                                        class:tie={row.tie}
                                    >
                                        {row.score}
                                    </span>
                                {/if}
                                <span class="pred" class:strong={row.predStrong}>
                                    {row.pred.toFixed(0)}
                                </span>
                            </button>
                        </div>
                    {/each}
                {:else}
                    {#each s.slots as slot}
                        <div class="alliance empty">{slotLabel(slot)}</div>
                    {/each}
                {/if}
            </div>
        {/each}
    </div>
</div>

<style>
    .scroller {
        overflow-x: auto;
        padding: var(--md-pad) 0;
        font-size: calc(var(--text-scale) * 1em);
    }

    .bracket {
        position: relative;
        margin: 0 auto;
    }

    svg {
        position: absolute;
        inset: 0;
        pointer-events: none;
    }

    path {
        fill: none;
        stroke: var(--alliance-text-color, var(--grayed-out-text-color));
        stroke-width: 2;
    }

    .series {
        position: absolute;
        display: flex;
        flex-direction: column;
        box-sizing: border-box;
        padding: var(--sm-pad);
        border-radius: 10px;
        background: var(--bg-color);
    }

    .series.placeholder {
        opacity: 0.55;
    }

    .alliance {
        display: flex;
        align-items: center;
        flex: 1;
        min-height: 0;
        margin-bottom: var(--row-margin);
        border-radius: 8px;
    }

    .alliance.red {
        background: var(--red-team-bg-color);
    }

    .alliance.blue {
        background: var(--blue-team-bg-color);
    }

    .alliance.alliance-colored {
        background: rgba(var(--alliance-color-vs), var(--team-color-transparency));
    }

    .alliance.lost {
        background: transparent;
        color: var(--grayed-out-text-color);
    }

    .alliance.empty {
        justify-content: center;
        color: var(--grayed-out-text-color);
        border: 1px dashed var(--sep-color);
    }

    .teams {
        display: flex;
        flex-direction: column;
        flex: 1;
        min-width: 0;
    }

    .teams table,
    .teams tbody,
    .teams tr {
        display: contents;
    }

    .alliance:not(.empty) {
        padding: 0 var(--sm-pad);
    }

    .alliance.red:not(.empty) {
        padding-bottom: var(--red-pad-bottom, 0);
    }

    .alliance.lost .score {
        color: var(--grayed-out-text-color);
    }

    .red .numbers {
        flex-direction: column-reverse;
        top: 6px;
    }

    .blue .numbers {
        top: -6px;
    }

    .numbers {
        position: relative;
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        flex: none;
        min-width: 3em;
        padding: var(--sm-pad);
        border: 0;
        border-radius: 8px;
        background: transparent;
        color: inherit;
        font: inherit;
        font-variant-numeric: tabular-nums;
        cursor: default;
    }

    .numbers.hasScores {
        cursor: pointer;
    }

    .numbers.hasScores:hover {
        outline: 2px solid var(--neutral-team-color);
    }

    .score {
        font-size: calc(1.25em / (var(--text-scale) * var(--scale)));
        line-height: 1.2;
    }

    .score.winner.red {
        font-weight: bold;
        color: var(--red-team-text-color);
    }

    .score.winner.blue {
        font-weight: bold;
        color: var(--blue-team-text-color);
    }

    .alliance-colored .score.winner {
        color: var(--alliance-bright-text-color);
    }

    .score.tie {
        font-weight: bold;
        color: var(--neutral-team-text-color);
    }

    .pred {
        font-size: 1em;
        color: var(--grayed-out-text-color);
    }

    .unplayed .pred {
        font-size: 1.3em;
    }

    .pred.strong {
        font-weight: 600;
        color: var(--text-color);
    }
</style>
