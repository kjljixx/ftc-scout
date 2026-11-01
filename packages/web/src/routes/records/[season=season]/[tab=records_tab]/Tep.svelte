<script lang="ts">
    import { page } from "$app/stores";
    import { DESCRIPTORS, getTepStatSet, SortDir, type Season } from "@ftc-scout/common";
    import ServerStatTableControls from "$lib/components/stats/ServerStatTableControls.svelte";
    import type { PageData } from "./$types";
    import SkulletReveal from "$lib/components/skeleton/SkulletReveal.svelte";
    import SampleDataTable from "$lib/components/skeleton/samples/SampleDataTable.svelte";
    import { PAGE_SIZE } from "./+page.svelte";

    $: season = +$page.params.season as Season;

    const SAMPLE_COLUMNS = [
        { label: "#", samples: ["1", "2", "3", "10"] },
        {
            label: "Team",
            samples: ["12345 Gear Gladiators", "8802 Circuit Breakers", "6001 The Hexagons"],
        },
        { label: "Total OPR", samples: ["312.4", "298.1", "287.7"], align: "right" as const },
        { label: "Auto OPR", samples: ["92.1", "88.4", "75.3"], align: "right" as const },
        { label: "TeleOp OPR", samples: ["150.2", "142.9", "139.0"], align: "right" as const },
        {
            label: "Event",
            samples: ["Southeast Raleigh Qualifier", "Greater Pittsburgh Qualifier"],
        },
    ];
    export let tepData: PageData["tepData"];
    export let focusedTeam: number | null;

    $: info = $tepData?.data.tepRecords;
    $: data = info?.data;

    $: descriptor = DESCRIPTORS[season];
    $: stats = getTepStatSet(season, false);
    $: totalPoints = descriptor.pensSubtract ? "totalPoints" : "totalPointsNp";
    $: defaultStats = [
        "team",
        totalPoints + "Opr",
        "autoPointsOpr",
        "dcPointsOpr",
        ...(descriptor.hasEndgame ? ["egPointsOpr"] : []),
        totalPoints + "Avg",
        "eventRank",
        "event",
        "eventRecord",
    ];
    $: defaultSort = { id: totalPoints + "Opr", dir: SortDir.Desc };

    $: filename = `${season}_Team_Records`;
    $: title = `${season} Team Records`;
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
    />
{:else}
    <SkulletReveal label="Loading team records">
        <SampleDataTable columns={SAMPLE_COLUMNS} rows={PAGE_SIZE} />
    </SkulletReveal>
{/if}
