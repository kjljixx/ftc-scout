<script lang="ts">
    import {
        Alliance,
        TournamentLevel,
        type FullMatchFragment,
    } from "../../graphql/generated/graphql-operations";
    import { sortTeams } from "../../util/sorters";
    import DeLives from "./DELives.svelte";
    import MatchScore, { computeWinner } from "./MatchScore.svelte";
    import MatchTeam from "./MatchTeam.svelte";

    export let match: FullMatchFragment;
    export let allMatches: FullMatchFragment[] = [];
    export let eventCode: string;
    export let season: number;
    export let timeZone: string;
    export let focusedTeam: number | null;
    export let teamCount = 0;
    export let showNonPenaltyScores = false;
    export let eventTeams: any[] = [];

    $: teams = match.teams;
    $: redTeams = teams.filter((t) => t.alliance == Alliance.Red);
    $: blueTeams = teams.filter((t) => t.alliance == Alliance.Blue);

    function splitBench(alliance: typeof redTeams) {
        let hasBench = alliance.length > 2;
        return {
            playing: hasBench ? alliance.filter((t) => t.onField) : alliance,
            benched: hasBench ? alliance.filter((t) => !t.onField) : [],
        };
    }

    $: redSplit = splitBench(redTeams);
    $: blueSplit = splitBench(blueTeams);

    $: redExtras = Array(Math.max(2 - redSplit.playing.length, 0)).fill(Alliance.Red);
    $: reds = [...redSplit.playing, ...redExtras].sort(sortTeams);
    $: blueExtras = Array(Math.max(2 - blueSplit.playing.length, 0)).fill(Alliance.Blue);
    $: blues = [...blueSplit.playing, ...blueExtras].sort(sortTeams);

    $: isDoubleElim = match.tournamentLevel == TournamentLevel.DoubleElim;
    $: isNewRound = isDoubleElim && checkIsNewRound(match.series, match.matchNum, teamCount);

    $: winner = computeWinner(match.scores);

    $: useNp = true;
    $: npStat = useNp ? ("totalPointsNp" as const) : ("totalPoints" as const);

    function matchesPlayedSoFar(teamNumber: number): number {
        return allMatches.filter(
            (m) =>
                m.tournamentLevel === TournamentLevel.Quals &&
                m.scores !== null &&
                m.teams.some((t) => t.teamNumber === teamNumber && !t.noShow && !t.dq && t.onField)
        ).length;
    }

    function weightedOpr(teamNumber: number): number {
        const matchEventTeam = eventTeams.find((et) => et.team.number === teamNumber);
        const previousBestOpr = matchEventTeam?.previousBestOpr ?? null;
        const currentOpr = matchEventTeam?.stats?.opr?.[npStat] ?? null;
        if (currentOpr !== null && previousBestOpr == null) return currentOpr;
        if (currentOpr == null && previousBestOpr !== null) return previousBestOpr;
        if (currentOpr == null && previousBestOpr == null) return 0;

        const currentWeight =
            allMatches.filter((m) => m.tournamentLevel === TournamentLevel.Quals).length > 0
                ? Math.min(matchesPlayedSoFar(teamNumber) / 5, 1)
                : 1;
        return currentWeight * currentOpr + (1 - currentWeight) * previousBestOpr;
    }

    $: redOprSum = redTeams
        .map((rt) => {
            if (rt.noShow || rt.dq || !rt.onField) return 0;
            return weightedOpr(rt.teamNumber);
        })
        .reduce((a, b) => a + b, 0);

    $: blueOprSum = blueTeams
        .map((bt) => {
            if (bt.noShow || bt.dq || !bt.onField) return 0;
            return weightedOpr(bt.teamNumber);
        })
        .reduce((a, b) => a + b, 0);

    function hasAlreadyLost(series: number, teamCount: number, alliance: Alliance): boolean {
        if (teamCount <= 10) {
            return false;
        } else if (teamCount <= 20) {
            return (
                series == 3 ||
                series == 5 ||
                (series == 6 && alliance == Alliance.Blue) ||
                series == 7
            );
        } else if (teamCount <= 40) {
            return (
                series == 5 ||
                series == 6 ||
                series == 8 ||
                series == 9 ||
                (series == 10 && alliance == Alliance.Blue) ||
                series == 11
            );
        } else {
            return (
                series == 5 ||
                series == 6 ||
                series == 9 ||
                series == 10 ||
                series == 12 ||
                series == 13 ||
                (series == 14 && alliance == Alliance.Blue) ||
                series == 15
            );
        }
    }

    function checkIsNewRound(series: number, matchNum: number, teamCount: number): boolean {
        if (matchNum != 1) {
            return false;
        }

        if (teamCount <= 10) {
            return false;
        } else if (teamCount <= 20) {
            return series == 3 || series == 5 || series == 6;
        } else if (teamCount <= 40) {
            return series == 3 || series == 5 || series == 7 || series == 9 || series == 10;
        } else {
            return series == 5 || series == 9 || series == 11 || series == 13 || series == 14;
        }
    }
</script>

<tr class:new-round={isNewRound}>
    <MatchScore
        {match}
        {timeZone}
        {showNonPenaltyScores}
        redPred={redOprSum}
        bluePred={blueOprSum}
    />

    <div class="cell red-cell">
        <div class="alliance red" class:lost={winner == Alliance.Blue}>
            {#if isDoubleElim}
                <DeLives
                    alliance={Alliance.Red}
                    alreadyLost={hasAlreadyLost(match.series, teamCount, Alliance.Red)}
                    lostThis={winner == Alliance.Blue}
                />
            {/if}

            <div class="roster">
                <div class="teams">
                    {#each reds as team}
                        {#if team == Alliance.Red}
                            <div />
                        {:else}
                            <MatchTeam
                                {team}
                                {eventCode}
                                {season}
                                {focusedTeam}
                                winner={winner == Alliance.Red}
                                span={1}
                                trad
                            />
                        {/if}
                    {/each}
                </div>
                {#each redSplit.benched as team}
                    <MatchTeam
                        {team}
                        {eventCode}
                        {season}
                        {focusedTeam}
                        winner={false}
                        span={1}
                        trad
                        benched
                    />
                {/each}
            </div>
        </div>
    </div>

    <div class="cell blue-cell">
        <div class="alliance blue" class:lost={winner == Alliance.Red}>
            <div class="roster">
                <div class="teams">
                    {#each blues as team}
                        {#if team == Alliance.Blue}
                            <div />
                        {:else}
                            <MatchTeam
                                {team}
                                {eventCode}
                                {season}
                                {focusedTeam}
                                winner={winner == Alliance.Blue}
                                span={1}
                                trad
                            />
                        {/if}
                    {/each}
                </div>
                {#each blueSplit.benched as team}
                    <MatchTeam
                        {team}
                        {eventCode}
                        {season}
                        {focusedTeam}
                        winner={false}
                        span={1}
                        trad
                        benched
                    />
                {/each}
            </div>

            {#if isDoubleElim}
                <DeLives
                    alliance={Alliance.Blue}
                    alreadyLost={hasAlreadyLost(match.series, teamCount, Alliance.Blue)}
                    lostThis={winner == Alliance.Red}
                />
            {/if}
        </div>
    </div>
</tr>

<style>
    tr {
        display: grid;
        grid-template-columns: var(--trad-match-cols);
        align-items: center;

        min-height: 68px;
    }

    tr.new-round {
        border-top: 1px solid var(--sep-color);
    }

    .cell {
        grid-row: 1;
        display: flex;
        align-items: center;
        min-width: 0;
    }

    .red-cell {
        grid-column: 2;
        justify-content: flex-end;
    }

    .blue-cell {
        grid-column: 4;
        justify-content: flex-start;
    }

    .alliance {
        display: flex;
        align-items: center;
        min-width: 0;

        padding: var(--sm-pad);
        border-radius: 8px;
    }

    .alliance.red {
        background: var(--red-team-bg-color);
    }

    .alliance.blue {
        background: var(--blue-team-bg-color);
    }

    .alliance.lost {
        background: transparent;
    }

    .roster {
        display: flex;
        flex-direction: column;
        min-width: 0;
    }
    .red .roster {
        align-items: flex-end;
    }
    .blue .roster {
        align-items: flex-start;
    }
    .teams {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 11.5em));
        gap: var(--sm-gap);
        min-width: 0;
    }

    @media (max-width: 640px) {
        tr {
            min-height: 56px;
        }

        .cell {
            justify-content: stretch;
        }

        .alliance,
        .roster,
        .teams {
            flex: 1;
        }
        .roster {
            align-items: stretch;
        }
        .red .roster,
        .blue .roster {
            align-items: stretch;
        }

        .teams {
            grid-template-columns: minmax(0, 1fr);
        }
    }
</style>
