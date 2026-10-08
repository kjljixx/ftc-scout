<script lang="ts">
    import { onMount } from "svelte";
    import { defineChart, dot, lineY, mountChart, type ChartHost } from "@tanstack/charts";
    import { scaleLinear } from "@tanstack/charts/scales/linear";
    import { scalePoint } from "@tanstack/charts/scales/point";
    import { tooltip } from "@tanstack/charts/tooltip";
    import { DESCRIPTORS, type Season } from "@ftc-scout/common";
    import Card from "$lib/components/Card.svelte";
    import type { TeamQuery } from "$lib/graphql/generated/graphql-operations";
    import { percentile, prettyPrintFloat, prettyPrintOrdinal } from "$lib/printers/number";

    export let history: NonNullable<NonNullable<TeamQuery["teamByNumber"]>["quickStatsHistory"]>;

    $: rows = history
        .slice()
        .sort((a, b) => a.season - b.season)
        .map((s) => ({
            season: DESCRIPTORS[s.season as Season].seasonName,
            opr: s.tot.value,
            rank: s.tot.rank,
            count: s.count,
            percentile: percentile(s.tot.rank, s.count),
            height: -Math.log10(s.tot.rank / s.count),
        }));

    $: topHeight = Math.max(3, Math.ceil(Math.max(...rows.map((r) => r.height))));
    $: heightTicks = Array.from({ length: topHeight + 1 }, (_, i) => i);

    $: definition = defineChart({
        marks: [
            lineY(rows, {
                id: "opr-percentile",
                x: "season",
                y: "height",
                stroke: "var(--inline-theme-color)",
                strokeWidth: 2,
            }),
            dot(rows, { x: "season", y: "height", fill: "var(--inline-theme-color)", r: 5 }),
        ],
        scales: {
            x: { scale: () => scalePoint<string>().padding(0.2) },
            y: {
                scale: scaleLinear().domain([0, topHeight]),
                grid: true,
                axis: {
                    label: "OPR rank among all teams",
                    ticks: { values: heightTicks, format: (v: number) => `Top ${100 / 10 ** v}%` },
                },
            },
        },
        tooltip: {
            use: tooltip,
            format: ({ datum }) =>
                `${prettyPrintFloat(datum.percentile)}% (${prettyPrintOrdinal(datum.rank)} of ${
                    datum.count
                }, OPR ${prettyPrintFloat(datum.opr)})`,
        },
    });

    let container: HTMLElement;
    let host: ChartHost<(typeof rows)[number], any, any> | null = null;

    onMount(() => {
        host = mountChart(container, { definition, height: 360, ariaLabel: "OPR percentile" });
        return () => host?.destroy();
    });

    $: host?.update({ definition, height: 360, ariaLabel: "OPR percentile" });
</script>

<Card vis={false}>
    <h2 class="section-title">OPR Percentile by Season</h2>
    <div bind:this={container} />
</Card>

<style>
    .section-title {
        margin: var(--sm-gap) 0 var(--md-gap);
        font-size: calc(var(--lg-font-size) * 1.4);
        font-weight: 600;
    }
</style>
