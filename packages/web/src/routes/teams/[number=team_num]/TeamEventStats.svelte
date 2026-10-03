<script lang="ts">
    import StdErrLabel from "$lib/components/stats/StdErrLabel.svelte";
    import type { TeamQuery } from "$lib/graphql/generated/graphql-operations";
    import { prettyPrintFloat, prettyPrintOrdinal } from "$lib/printers/number";
    import { DESCRIPTORS, type Season } from "@ftc-scout/common";

    type Stats = NonNullable<TeamQuery["teamByNumber"]>["events"][number]["stats"];

    export let season: Season;
    export let remote: boolean;
    export let stats: Stats | undefined;

    $: oprStdErrGroup = (stats && "oprSe" in stats ? stats.oprSe : undefined) as
        | Record<string, number | null | undefined>
        | undefined;
    $: oprStdErr = oprStdErrGroup?.totalPoints ?? oprStdErrGroup?.totalPointsNp;
    $: np = DESCRIPTORS[season].pensSubtract || remote ? "" : "np";
</script>

{#if stats}
    <div class="line">
        <span><b>{prettyPrintOrdinal(stats.rank)}</b> place (quals)</span>
        {#if "wins" in stats}
            <span>W-L-T <b>{stats.wins}-{stats.losses}-{stats.ties}</b></span>
        {/if}
        {#if "rp" in stats}
            <span><b>{prettyPrintFloat(stats.rp)}</b> RP</span>
        {/if}
    </div>
    {#if "opr" in stats || "avg" in stats}
        <div class="line">
            {#if "opr" in stats}
                {@const opr =
                    "totalPoints" in stats.opr ? stats.opr.totalPoints : stats.opr.totalPointsNp}
                <span>
                    <b>{prettyPrintFloat(opr)}</b>
                    <StdErrLabel stdErr={oprStdErr} inline />
                    {np}OPR
                </span>
            {/if}
            {#if "avg" in stats}
                {@const avg =
                    "totalPoints" in stats.avg ? stats.avg.totalPoints : stats.avg.totalPointsNp}
                <span><b>{prettyPrintFloat(avg)}</b> {np}AVG</span>
            {/if}
        </div>
    {/if}
{/if}

<style>
    .line {
        display: flex;
        flex-wrap: wrap;
        gap: 0 var(--md-gap);
        color: var(--secondary-text-color);
    }

    .line span + span::before {
        content: "\00b7";
        margin-right: var(--md-gap);
    }

    b {
        color: var(--text-color);
    }
</style>
