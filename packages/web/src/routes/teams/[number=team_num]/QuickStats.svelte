<script lang="ts">
    import { DESCRIPTORS, type Season } from "@ftc-scout/common";
    import Card from "../../../lib/components/Card.svelte";
    import StdErrLabel from "../../../lib/components/stats/StdErrLabel.svelte";
    import type { TeamQuery } from "../../../lib/graphql/generated/graphql-operations";
    import { prettyPrintFloat, prettyPrintOrdinal } from "../../../lib/printers/number";

    export let stats: NonNullable<NonNullable<TeamQuery["teamByNumber"]>["quickStats"]>;
    export let season: Season;
    $: np = DESCRIPTORS[season].pensSubtract ? "" : "NP ";

    $: columns = [
        { label: `Total ${np}OPR`, stat: stats.tot, stdErr: stats.tot.stdErr },
        { label: "Auto", stat: stats.auto, stdErr: null },
        { label: "Teleop", stat: stats.dc, stdErr: null },
        { label: "Endgame", stat: stats.eg, stdErr: null },
    ];

    const percentile = (rank: number, count: number) =>
        prettyPrintFloat((1 - (rank - 1) / (count - 1)) * 100);
</script>

<Card vis={false}>
    <div class="stats" id="quick-stats">
        {#each columns as { label, stat, stdErr }}
            <div class="stat" title="Best {label} this season">
                <span class="label">{label}</span>
                <span class="value">
                    {prettyPrintFloat(stat.value)}
                    {#if stdErr != null}<StdErrLabel {stdErr} inline />{/if}
                </span>
                <span class="rank">
                    {prettyPrintOrdinal(stat.rank)} &middot; {percentile(stat.rank, stats.count)}%
                </span>
            </div>
        {/each}
    </div>
</Card>

<style>
    .stats {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: var(--lg-gap) var(--vl-gap);
    }

    @media (max-width: 600px) {
        .stats {
            grid-template-columns: repeat(2, minmax(0, 1fr));
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
