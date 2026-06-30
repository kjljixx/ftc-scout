<script lang="ts">
    import type { EventPageQuery } from "$lib/graphql/generated/graphql-operations";
    import { DESCRIPTORS, getTepStatSet, type Season } from "@ftc-scout/common";
    import { faGripLines } from "@fortawesome/free-solid-svg-icons";
    import Fa from "svelte-fa";

    import StatCell from "$lib/components/stats/StatCell.svelte";

    type DataTy = NonNullable<EventPageQuery["eventByCode"]>["teams"][number];

    export let season: Season;
    export let remote: boolean;
    export let eventName: string;
    export let data: DataTy[];
    export let focusedTeam: number | null;

    $: descriptor = DESCRIPTORS[season];
    $: stats = getTepStatSet(season, remote);
    $: totalPoints = descriptor.pensSubtract || remote ? "totalPoints" : "totalPointsNp";
    $: defaultStats = ["team", ...(remote ? [] : [totalPoints + "Opr"]), "eventRank"];

    let draggedIndex: number | null = null;
    let hoveredIndex: number | null = null;

    let teamOrder: number[] = [];

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

    $: wrappedOrderedData = orderedData.map((team, index) => ({
        filterRank: index + 1,
        filterSkipRank: index + 1,
        noFilterRank: index + 1,
        noFilterSkipRank: index + 1,
        data: team,
    }));

    function handleDragStart(event: DragEvent, index: number) {
        draggedIndex = index;
        if (event.dataTransfer) {
            event.dataTransfer.effectAllowed = "move";
        }
    }

    function handleDragOver(event: DragEvent, index: number) {
        event.preventDefault();
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

<div class="table-scroll-container">
    <table class="draggable-table">
        <thead>
            <tr>
                <th class="drag-handle-header empty" />
                {#each defaultStats as statId}
                    {@const stat = stats.getStat(statId)}
                    <th class={stat?.color ?? ""} class:expand={stat?.shouldExpand()}>
                        {stat?.columnName ?? statId}
                    </th>
                {/each}
            </tr>
        </thead>
        <tbody>
            {#each wrappedOrderedData as wrapped, index (wrapped.data.team?.number ?? index)}
                <tr
                    class="team-row"
                    class:dragging={draggedIndex === index}
                    class:hovered={hoveredIndex === index}
                    draggable="true"
                    on:dragstart={(e) => handleDragStart(e, index)}
                    on:dragover={(e) => handleDragOver(e, index)}
                    on:drop={(e) => handleDrop(e, index)}
                    on:dragend={resetDragState}
                >
                    <td class="drag-handle-cell">
                        <span class="drag-handle">
                            <Fa {faGripLines} scale="0.75x" />
                        </span>
                    </td>
                    {#each defaultStats as statId}
                        <StatCell data={wrapped} stat={stats.getStat(statId)} {focusedTeam} />
                    {/each}
                </tr>
            {/each}
        </tbody>
    </table>
</div>

<style>
    .drag-instructions {
        margin-bottom: 0.75rem;
        font-weight: 500;
    }

    .table-scroll-container {
        flex-grow: 1;
        overflow-y: auto;
    }

    .draggable-table {
        border-spacing: 0;
        border: 1px solid var(--sep-color);
        border-radius: 8px;

        display: block;
        min-width: 100%;
        width: min-content;
        max-width: 100%;
        position: relative;
        background-color: var(--fg-color);
    }

    .draggable-table :global(thead:not(.sticking) th:first-child) {
        border-top-left-radius: 7px;
    }
    .draggable-table :global(thead:not(.sticking) th:last-child) {
        border-top-right-radius: 7px;
    }
    .draggable-table tbody :global(tr:last-child td:first-child) {
        border-bottom-left-radius: 7px;
    }
    .draggable-table tbody :global(tr:last-child td:last-child) {
        border-bottom-right-radius: 7px;
    }

    .draggable-table th {
        padding: var(--lg-pad);
        font-weight: bold;
        text-align: center;
        white-space: nowrap;
        user-select: none;
        color: var(--stat-text-color);
    }

    @media (max-width: 600px) {
        .draggable-table th {
            padding: var(--lg-pad) var(--sm-pad);
        }
    }

    .expand {
        width: 100%;
    }

    .empty {
        cursor: inherit;
    }

    .white {
        color: var(--text-color);
        box-shadow: rgb(0 0 0 / 14%) 0px -4px 4px -2px inset;
        background: var(--fg-color);
    }
    .red {
        background: var(--red-stat-color);
    }
    .blue {
        background: var(--blue-stat-color);
    }
    .light-blue {
        background: var(--light-blue-stat-color);
    }
    .purple {
        background: var(--purple-stat-color);
    }
    .green {
        background: var(--green-stat-color);
    }

    .team-row {
        outline: transparent 2px solid;
        outline-offset: -2px;
        transition: outline 0.12s ease 0s;
        cursor: grab;
    }

    .team-row:active {
        cursor: grabbing;
    }

    .draggable-table tbody :global(tr:nth-child(even)) {
        background-color: var(--zebra-stripe-opacity);
    }

    .team-row:hover {
        outline: 2px solid var(--neutral-team-color);
        z-index: var(--focused-row-zi);
    }

    .team-row.dragging {
        opacity: 0.3;
    }

    .team-row.hovered {
        outline: 2px solid var(--blue-stat-color);
        background-color: rgba(59, 130, 246, 0.12);
    }

    .drag-handle-header {
        width: 40px;
        min-width: 40px;
    }

    .drag-handle-cell {
        width: 40px;
        min-width: 40px;
        text-align: center;
        vertical-align: middle;
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

    .na {
        color: var(--secondary-text-color);
        font-size: var(--sm-font-size);
    }

    .table-scroll-container::-webkit-scrollbar {
        width: 6px;
    }
    .table-scroll-container::-webkit-scrollbar-track {
        background: transparent;
    }
    .table-scroll-container::-webkit-scrollbar-thumb {
        background: rgba(255, 255, 255, 0.15);
        border-radius: 3px;
    }
    .table-scroll-container::-webkit-scrollbar-thumb:hover {
        background: var(--secondary-text-color, rgba(255, 255, 255, 0.3));
    }
</style>
