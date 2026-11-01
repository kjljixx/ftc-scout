<script lang="ts">
    import { page } from "$app/stores";
    import { DESCRIPTORS, SortDir, type Season, getMatchStatSet } from "@ftc-scout/common";
    import ServerStatTableControls from "$lib/components/stats/ServerStatTableControls.svelte";
    import type { PageData } from "./$types";
    import SkulletReveal from "$lib/components/skeleton/SkulletReveal.svelte";
    import SampleDataTable from "$lib/components/skeleton/samples/SampleDataTable.svelte";
    import { PAGE_SIZE } from "./+page.svelte";
    import { getMatchScoresForAlliance } from "../../../../lib/components/stats/getMatchScores";

    $: season = +$page.params.season as Season;

    const SAMPLE_COLUMNS = [
        { label: "#", samples: ["1", "2", "3", "10"] },
        { label: "Score", samples: ["412", "398", "387"], align: "right" as const },
        { label: "Alliance", samples: ["12345 Gear Gladiators, 8802 Circuit Breakers"] },
        { label: "Match", samples: ["Q12", "SF2-1", "F-3"] },
        {
            label: "Event",
            samples: ["Southeast Raleigh Qualifier", "Greater Pittsburgh Qualifier"],
        },
    ];
    export let matchData: PageData["matchData"];
    export let focusedTeam: number | null;

    $: info = $matchData?.data.matchRecords;
    $: data = info?.data?.map((d) => ({
        data: getMatchScoresForAlliance(d.data.match, d.data.alliance),
        filterRank: d.filterRank,
        filterSkipRank: d.filterSkipRank,
        noFilterRank: d.noFilterRank,
        noFilterSkipRank: d.noFilterSkipRank,
    }));

    $: descriptor = DESCRIPTORS[season];
    $: stats = getMatchStatSet(season, false);
    $: totalPoints = descriptor.pensSubtract ? "totalPointsThis" : "totalPointsNpThis";
    $: defaultStats = [
        totalPoints,
        "autoPointsThis",
        "dcPointsThis",
        ...(descriptor.hasEndgame ? ["egPointsThis"] : []),
        ...descriptor.getMatchInsightCols(false).map((c) => c + "This"),
        "team1This",
        "team2This",
        "event",
        "matchNum",
        "alliance",
    ];
    $: defaultSort = { id: totalPoints, dir: SortDir.Desc };

    $: filename = `${season}_Match_Records`;
    $: title = `${season} Match Records`;
    $: csv = { filename, title };
</script>

{#if info && data}
    <ServerStatTableControls
        {data}
        {stats}
        {defaultSort}
        {defaultStats}
        pageCount={Math.ceil(info.count / PAGE_SIZE)}
        {focusedTeam}
        {csv}
        includeSkipRankTys={false}
    />
{:else}
    <SkulletReveal label="Loading match records">
        <SampleDataTable columns={SAMPLE_COLUMNS} rows={PAGE_SIZE} />
    </SkulletReveal>
{/if}
