<script lang="ts">
    import { DESCRIPTORS, type Season } from "@ftc-scout/common";
    import Card from "../../../lib/components/Card.svelte";
    import { computeWinner } from "../../../lib/components/matches/MatchScore.svelte";
    import StdErrLabel from "../../../lib/components/stats/StdErrLabel.svelte";
    import {
        TournamentLevel,
        type TeamQuery,
    } from "../../../lib/graphql/generated/graphql-operations";
    import { percentile, prettyPrintFloat, prettyPrintOrdinal } from "../../../lib/printers/number";

    type Team = NonNullable<TeamQuery["teamByNumber"]>;
    type TeamMatch = NonNullable<Team["events"]>[number]["matches"][number];
    type Tally = { wins: number; losses: number; ties: number };

    export let stats: NonNullable<Team["quickStats"]>;
    export let events: NonNullable<Team["events"]>;
    export let season: Season;
    $: np = DESCRIPTORS[season].pensSubtract ? "" : "NP ";

    function tally(matches: TeamMatch[]): Tally {
        let result: Tally = { wins: 0, losses: 0, ties: 0 };
        for (let { alliance, station, match } of matches) {
            let winner: string | null = computeWinner(match.scores);
            let surrogate = match.teams.find((t) => t.station == station)?.surrogate;
            if (surrogate || winner == null || winner == "Solo") continue;

            if (winner == "Tie") result.ties++;
            else if (winner == alliance) result.wins++;
            else result.losses++;
        }
        return result;
    }

    const played = ({ wins, losses, ties }: Tally) => wins + losses + ties;
    const formatRecord = ({ wins, losses, ties }: Tally) => `${wins}–${losses}–${ties}`;
    const formatWinRate = (t: Tally) =>
        `${prettyPrintFloat(played(t) ? (100 * t.wins) / played(t) : 0)}% win rate`;

    $: allMatches = events.flatMap((e) => e.matches);
    $: record = tally(allMatches);
    $: playoffs = tally(allMatches.filter((m) => m.match.tournamentLevel != TournamentLevel.Quals));
</script>

<Card vis={false}>
    <div class="stats" id="quick-stats">
        <div class="stat" title="Best Total {np}OPR this season">
            <span class="label">Total {np}OPR</span>
            <span class="value">
                {prettyPrintFloat(stats.tot.value)}
                {#if stats.tot.stdErr != null}<StdErrLabel stdErr={stats.tot.stdErr} inline />{/if}
            </span>
            <span class="rank">
                {prettyPrintOrdinal(stats.tot.rank)} &middot; {prettyPrintFloat(
                    percentile(stats.tot.rank, stats.count)
                )}%
            </span>
        </div>

        {#if played(record)}
            <div class="stat" title="Win-loss-tie record across all matches this season">
                <span class="label">Record</span>
                <span class="value">{formatRecord(record)}</span>
                <span class="rank">{formatWinRate(record)}</span>
            </div>
            <div class="stat" title="Win-loss-tie record in playoff matches this season">
                <span class="label">Playoffs</span>
                <span class="value">{formatRecord(playoffs)}</span>
                <span class="rank">{formatWinRate(playoffs)}</span>
            </div>
        {/if}
    </div>
</Card>

<style>
    .stats {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: var(--lg-gap) var(--vl-gap);
    }

    @media (max-width: 600px) {
        .stats {
            grid-template-columns: repeat(2, minmax(0, 1fr));
        }

        .stat:first-child {
            grid-column: 1 / -1;
        }
    }

    @media (max-width: 550px) {
        .stats {
            padding-left: var(--md-pad);
        }
    }

    .stat {
        display: flex;
        flex-direction: column;
        gap: var(--sm-gap);
    }

    .label,
    .rank {
        font-size: var(--md-font-size);
        color: var(--text-color);
    }

    .value {
        font-size: var(--xl-font-size);
        font-weight: 600;
        line-height: 1.2;
        font-variant-numeric: tabular-nums;
    }
</style>
