<script lang="ts">
    import type { EventPageQuery } from "$lib/graphql/generated/graphql-operations";
    import { DESCRIPTORS, getTepStatSet, SortDir, type Season } from "@ftc-scout/common";
    import LocalStatTableControls from "$lib/components/stats/LocalStatTableControls.svelte";
    import { faGripLines } from "@fortawesome/free-solid-svg-icons";
    import Fa from "svelte-fa";

    type DataTy = NonNullable<EventPageQuery["eventByCode"]>["teams"][number];

    export let season: Season;
    export let remote: boolean;
    export let eventName: string;
    export let data: DataTy[];
    export let focusedTeam: number | null;

    $: descriptor = DESCRIPTORS[season];
    $: stats = getTepStatSet(season, remote);
    $: totalPoints = descriptor.pensSubtract || remote ? "totalPoints" : "totalPointsNp";
    $: defaultStats = [
        "eventRank",
        "team",
        "rankingScore",
        "tb1",
        "played",
        totalPoints + "Avg",
        ...(remote ? [] : [totalPoints + "Opr"]),
        totalPoints + "Max",
    ];

    $: saveId = `eventPageTep${season}${remote ? "Remote" : "Trad"}`;

    $: underscoreEventName = eventName.replace(" ", "_");
    $: filename = `${season}_${underscoreEventName}_Team_Stats`;
    $: title = `${season} ${eventName} Team Stats`;
    $: csv = { filename, title };

    // --- Drag and Drop State ---
    let draggedIndex: number | null = null;
    let hoveredIndex: number | null = null;

    // Maintain drag state in a local reactive state
    let teamOrder: number[] = [];

    // Sync teamOrder when the raw data changes (e.g. initial load or structural changes)
    $: {
        const currentNums = data.map((d) => d.team?.number).filter((n): n is number => n != null);
        const currentSet = new Set(currentNums);
        const orderSet = new Set(teamOrder);

        const hasDifferences =
            currentNums.some((n) => !orderSet.has(n)) || teamOrder.some((n) => !currentSet.has(n));

        if (hasDifferences) {
            const filteredExisting = teamOrder.filter((n) => currentSet.has(n));
            const newItems = currentNums.filter((n) => !orderSet.has(n));
            teamOrder = [...filteredExisting, ...newItems];
        }
    }

    // Sort the teams list according to the tracked custom order
    $: orderedData = (() => {
        if (teamOrder.length === 0) return data;
        const orderMap = new Map(teamOrder.map((num, i) => [num, i]));
        return [...data].sort((a, b) => {
            const aNum = a.team?.number;
            const bNum = b.team?.number;
            if (aNum == null || bNum == null) return 0;
            const aIdx = orderMap.has(aNum) ? orderMap.get(aNum)! : Infinity;
            const bIdx = orderMap.has(bNum) ? orderMap.get(bNum)! : Infinity;
            return aIdx - bIdx;
        });
    })();

    // Decouples table mutations from the drag-and-drop list's array reference
    $: tableData = [...orderedData];

    function handleDragStart(event: DragEvent, index: number) {
        draggedIndex = index;
        if (event.dataTransfer) {
            event.dataTransfer.effectAllowed = "move";
        }
    }

    function handleDragOver(event: DragEvent, index: number) {
        event.preventDefault(); // Required to allow dropping
        hoveredIndex = index;
    }

    function handleDrop(event: DragEvent, index: number) {
        event.preventDefault();
        if (draggedIndex === null || draggedIndex === index) return;

        const updatedOrder = [...teamOrder];
        const [movedItem] = updatedOrder.splice(draggedIndex, 1);
        updatedOrder.splice(index, 0, movedItem);

        teamOrder = updatedOrder;
        resetDragState();
    }

    function resetDragState() {
        draggedIndex = null;
        hoveredIndex = null;
    }
</script>

<div class="reorder-container">
    <div class="drag-instructions na">Drag and drop teams to manually reorder:</div>
    <div class="team-list">
        {#each orderedData as team, index (team.team?.number ?? index)}
            <div
                class="team-item"
                class:dragging={draggedIndex === index}
                class:hovered={hoveredIndex === index}
                draggable="true"
                on:dragstart={(e) => handleDragStart(e, index)}
                on:dragover={(e) => handleDragOver(e, index)}
                on:drop={(e) => handleDrop(e, index)}
                on:dragend={resetDragState}
            >
                <span class="drag-handle">
                    <Fa {faGripLines} scale="0.75x" />
                </span>
                <span class="team-number">#{team.team?.number ?? "Unknown"}</span>
                {#if team.team?.name}
                    <span class="team-name na">{team.team.name}</span>
                {/if}
            </div>
        {/each}
    </div>
</div>

<LocalStatTableControls
    {saveId}
    data={tableData}
    {focusedTeam}
    {stats}
    {defaultStats}
    defaultSort={{ id: "eventRank", dir: SortDir.Asc }}
    hideRankStats={[
        "eventRank",
        "rankingScore",
        ...(descriptor.rankings.rp == "Record" ? ["record"] : ["totalPointsAvg", "totalPointsTot"]),
    ]}
    {csv}
/>

<style>
    .reorder-container {
        margin-bottom: 1.5rem;
        padding: var(--md-pad);
        background-color: rgba(255, 255, 255, 0.02);
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 0.375rem;
    }

    .drag-instructions {
        margin-bottom: 0.75rem;
        font-weight: 500;
    }

    .team-list {
        display: flex;
        flex-direction: column;
        max-height: 280px;
        overflow-y: auto;
        padding-right: 0.25rem;
    }

    .team-item {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        padding: var(--md-pad);
        background-color: rgba(255, 255, 255, 0.03);
        border-bottom: 1px solid rgba(255, 255, 255, 0.05);
        font-size: var(--sm-font-size, 0.875rem);
        transition: background-color 0.1s;
    }

    .team-item:hover {
        background-color: rgba(255, 255, 255, 0.08);
    }

    .team-item.dragging {
        opacity: 0.3;
    }

    .team-item.hovered {
        background-color: var(--blue-stat-bg-color);
    }

    .drag-handle {
        color: var(--secondary-text-color);
        cursor: grab;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 1.25rem;
        height: 1.25rem;
    }

    .drag-handle:active {
        cursor: grabbing;
    }

    .icon-svg {
        width: 100%;
        height: 100%;
    }

    .team-number {
        font-weight: bold;
        min-width: 4.5rem;
    }

    .na {
        color: var(--secondary-text-color);
        font-size: var(--sm-font-size);
    }

    .team-name {
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .team-list::-webkit-scrollbar {
        width: 6px;
    }
    .team-list::-webkit-scrollbar-track {
        background: transparent;
    }
    .team-list::-webkit-scrollbar-thumb {
        background: rgba(255, 255, 255, 0.15);
        border-radius: 3px;
    }
    .team-list::-webkit-scrollbar-thumb:hover {
        background: var(--secondary-text-color, rgba(255, 255, 255, 0.3));
    }
</style>
