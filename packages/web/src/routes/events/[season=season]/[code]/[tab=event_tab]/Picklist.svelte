<script lang="ts">
    import {
        SetEventPicklistDocument,
        AddCustomFieldDocument,
        RemoveCustomFieldDocument,
        SetCustomFieldValueDocument,
        type EventPageQuery,
    } from "$lib/graphql/generated/graphql-operations";
    import { DESCRIPTORS, getTepStatSet, type Season } from "@ftc-scout/common";
    import { faGripLines } from "@fortawesome/free-solid-svg-icons";
    import Fa from "svelte-fa";
    import { onDestroy } from "svelte";
    import { getClient } from "$lib/graphql/client";
    import {
        createPicklistSyncHandle,
        picklistState,
        type CustomFieldTy,
        type CustomValueTy,
        type PicklistState,
    } from "$lib/picklist/picklistSync";

    import StatCell from "$lib/components/stats/StatCell.svelte";
    import Skeleton from "$lib/components/skeleton/Skeleton.svelte";

    type DataTy = NonNullable<EventPageQuery["eventByCode"]>["teams"][number];

    export let season: Season;
    export let remote: boolean;
    export let eventCode: string;
    export let data: DataTy[];
    export let focusedTeam: number | null;

    $: descriptor = DESCRIPTORS[season];
    $: stats = getTepStatSet(season, remote);
    $: totalPoints = descriptor.pensSubtract || remote ? "totalPoints" : "totalPointsNp";
    $: defaultStats = ["team", ...(remote ? [] : [totalPoints + "Opr"]), "eventRank"];

    let draggedIndex: number | null = null;
    let hoveredIndex: number | null = null;

    let teamOrder: number[] = [];

    let touchStartIdx: number | null = null;
    let touchTargetIdx: number | null = null;
    let lastTouchX = 0;
    let lastTouchY = 0;

    let content = document.getElementById("content");

    let lastSyncedOrder: number[] | null = null;
    let saveTimeout: ReturnType<typeof setTimeout> | null = null;

    let customFields: CustomFieldTy[] = [];
    let customValues: Record<number, Record<string, string | number | boolean>> = {};
    let pendingValueKeys = new Set<string>();
    let valueSaveTimeouts: Record<string, ReturnType<typeof setTimeout>> = {};

    let newFieldName = "";
    let newFieldType: string = "string";

    function valueKey(fieldId: string, teamNumber: number) {
        return `${fieldId}:${teamNumber}`;
    }

    function applyRemoteValues(flat: CustomValueTy[]) {
        let newMap: Record<number, Record<string, string | number | boolean>> = {};
        for (let v of flat) {
            let key = valueKey(v.fieldId, v.teamNumber);
            newMap[v.teamNumber] = newMap[v.teamNumber] ?? {};
            newMap[v.teamNumber][v.fieldId] = pendingValueKeys.has(key)
                ? customValues[v.teamNumber]?.[v.fieldId] ?? v.value
                : v.value;
        }
        customValues = newMap;
    }

    const picklistSync = createPicklistSyncHandle();
    $: picklistSync.sync(season, eventCode);

    function applyPicklistState(state: PicklistState) {
        if (!state.loaded) return;
        if (state.teamOrder && !sameOrder(state.teamOrder, lastSyncedOrder)) {
            lastSyncedOrder = state.teamOrder;
            teamOrder = state.teamOrder;
        }
        customFields = state.customFields;
        applyRemoteValues(state.customValues);
    }

    $: applyPicklistState($picklistState);

    onDestroy(() => {
        picklistSync.stop();
        if (saveTimeout) clearTimeout(saveTimeout);
        Object.values(valueSaveTimeouts).forEach(clearTimeout);
    });

    function sameOrder(a: number[], b: number[] | null): boolean {
        return !!b && a.length === b.length && a.every((n, i) => n === b[i]);
    }

    function queuePicklistSave(order: number[]) {
        if (saveTimeout) clearTimeout(saveTimeout);
        saveTimeout = setTimeout(() => savePicklist(order), 600);
    }

    async function savePicklist(order: number[]) {
        lastSyncedOrder = order;
        await getClient().mutate({
            mutation: SetEventPicklistDocument,
            variables: { season, eventCode, teamOrder: order },
        });
    }

    async function addCustomField() {
        let name = newFieldName.trim();
        if (!name) return;
        let result = await getClient().mutate({
            mutation: AddCustomFieldDocument,
            variables: { season, eventCode, name, fieldType: newFieldType },
        });
        customFields = result.data?.addCustomField?.customFields ?? customFields;
        newFieldName = "";
    }

    async function removeCustomField(fieldId: string) {
        let result = await getClient().mutate({
            mutation: RemoveCustomFieldDocument,
            variables: { season, eventCode, fieldId },
        });
        customFields = result.data?.removeCustomField?.customFields ?? customFields;

        let newValues: Record<number, Record<string, string | number | boolean>> = {};
        for (let [teamNumber, fields] of Object.entries(customValues)) {
            let { [fieldId]: _removed, ...rest } = fields;
            newValues[+teamNumber] = rest;
        }
        customValues = newValues;
    }

    function onCustomCellInput(teamNumber: number, field: CustomFieldTy, e: Event) {
        let rawValue = (e.target as HTMLInputElement).value;
        customValues = {
            ...customValues,
            [teamNumber]: { ...(customValues[teamNumber] ?? {}), [field.id]: rawValue },
        };

        let key = valueKey(field.id, teamNumber);
        pendingValueKeys.add(key);
        if (valueSaveTimeouts[key]) clearTimeout(valueSaveTimeouts[key]);
        valueSaveTimeouts[key] = setTimeout(
            () => saveCustomCellValue(teamNumber, field, rawValue),
            600
        );
    }

    async function saveCustomCellValue(teamNumber: number, field: CustomFieldTy, rawValue: string) {
        let key = valueKey(field.id, teamNumber);
        let value: string | number | boolean = rawValue;
        if (field.type === "float") {
            let parsed = parseFloat(rawValue);
            if (Number.isNaN(parsed)) {
                pendingValueKeys.delete(key);
                return;
            }
            value = parsed;
        }

        await getClient().mutate({
            mutation: SetCustomFieldValueDocument,
            variables: { season, eventCode, teamNumber, fieldId: field.id, value },
        });
        pendingValueKeys.delete(key);
    }

    async function toggleCheckbox(teamNumber: number, field: CustomFieldTy, e: Event) {
        let checked = (e.target as HTMLInputElement).checked;
        customValues = {
            ...customValues,
            [teamNumber]: { ...(customValues[teamNumber] ?? {}), [field.id]: checked },
        };
        await getClient().mutate({
            mutation: SetCustomFieldValueDocument,
            variables: { season, eventCode, teamNumber, fieldId: field.id, value: checked },
        });
    }

    $: sortedData = remote
        ? data
        : [...data].sort((a, b) => {
              const stat = stats.getStat(totalPoints + "Opr");
              const av = stat?.getNonRankValueDistilled(a) ?? -Infinity;
              const bv = stat?.getNonRankValueDistilled(b) ?? -Infinity;
              if (av == null && bv == null) return 0;
              if (av == null) return 1;
              if (bv == null) return -1;
              return (bv as any) - (av as any);
          });

    $: {
        const currentNums = sortedData
            .map((d) => d.team?.number)
            .filter((n): n is number => n != null);
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
        if (teamOrder.length === 0) return sortedData;
        const orderMap = new Map(teamOrder.map((num, i) => [num, i]));
        return [...sortedData].sort((a, b) => {
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
        queuePicklistSave(updatedOrder);
        resetDragState();
    }

    function resetDragState() {
        draggedIndex = null;
        hoveredIndex = null;
    }

    function handleTouchStart(event: TouchEvent, index: number) {
        const target = event.target as HTMLElement;
        if (!target.closest(".drag-handle")) return;

        event.preventDefault();
        touchStartIdx = index;
        draggedIndex = index;
    }

    function updateHoveredItem() {
        const element = document.elementFromPoint(lastTouchX, lastTouchY);
        const row = element?.closest(".team-row") as HTMLElement | null;

        if (row && row.dataset.index !== undefined) {
            const index = parseInt(row.dataset.index, 10);
            hoveredIndex = index;
            touchTargetIdx = index;
        } else {
            hoveredIndex = null;
            touchTargetIdx = null;
        }
    }

    function handleAutoScroll() {
        const threshold = 100;
        const maxSpeed = 15;
        const rect = content?.getBoundingClientRect();
        if (!rect) return;
        const topBound = rect.top + threshold;
        const bottomBound = rect.bottom - threshold;

        if (lastTouchY < topBound) {
            const ratio = (topBound - lastTouchY) / threshold;
            content?.scrollBy(0, -Math.max(2, Math.round(ratio * maxSpeed)));
        } else if (lastTouchY > bottomBound) {
            const ratio = (lastTouchY - bottomBound) / threshold;
            content?.scrollBy(0, Math.max(2, Math.round(ratio * maxSpeed)));
        }
    }

    function handleTouchMove(event: TouchEvent) {
        if (touchStartIdx === null) return;

        const touch = event.touches[0];
        lastTouchX = touch.clientX;
        lastTouchY = touch.clientY;

        handleAutoScroll();
        updateHoveredItem();
    }

    function handleTouchEnd() {
        if (touchStartIdx !== null && touchTargetIdx !== null && touchStartIdx !== touchTargetIdx) {
            const updatedOrder = [...teamOrder];
            const [movedItem] = updatedOrder.splice(touchStartIdx, 1);
            updatedOrder.splice(touchTargetIdx, 0, movedItem);

            teamOrder = updatedOrder;
            queuePicklistSave(updatedOrder);
        }
        touchStartIdx = null;
        touchTargetIdx = null;
        resetDragState();
    }
</script>

{#if !$picklistState.loaded}
    <Skeleton />
{:else}
<div class="custom-fields-manager">
    <input
        class="new-field-name"
        type="text"
        placeholder="New field name"
        bind:value={newFieldName}
        on:keydown={(e) => e.key === "Enter" && addCustomField()}
    />
    <select bind:value={newFieldType}>
        <option value="string">Text</option>
        <option value="float">Number</option>
        <option value="boolean">Checkbox</option>
    </select>
    <button class="add-field-btn" on:click={addCustomField}>Add Field</button>
</div>

<div class="table-scroll-container">
    <table class="draggable-table">
        <thead>
            <tr>
                <th class="rank-header">#</th>
                <th class="drag-handle-header empty" />
                {#each defaultStats as statId}
                    {@const stat = stats.getStat(statId)}
                    <th class={stat?.color ?? ""} class:expand={stat?.shouldExpand()}>
                        {stat?.columnName ?? statId}
                    </th>
                {/each}
                {#each customFields as field (field.id)}
                    <th
                        class="custom-field-header"
                        class:number-header={field.type === "float" || field.type === "boolean"}
                    >
                        <span class="custom-field-name">{field.name}</span>
                        <button
                            class="remove-field-btn"
                            title="Remove field"
                            on:click={() => removeCustomField(field.id)}
                        >
                            ×
                        </button>
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
                    data-index={index}
                    draggable="true"
                    on:dragstart={(e) => handleDragStart(e, index)}
                    on:dragover={(e) => handleDragOver(e, index)}
                    on:drop={(e) => handleDrop(e, index)}
                    on:dragend={resetDragState}
                    on:touchstart|nonpassive={(e) => handleTouchStart(e, index)}
                    on:touchmove|nonpassive={handleTouchMove}
                    on:touchend={handleTouchEnd}
                >
                    <td class="rank-cell">
                        {index + 1}
                    </td>
                    <td class="drag-handle-cell">
                        <span class="drag-handle">
                            <Fa icon={faGripLines} scale="1.0x" />
                        </span>
                    </td>
                    {#each defaultStats as statId}
                        <StatCell data={wrapped} stat={stats.getStat(statId)} {focusedTeam} />
                    {/each}
                    {#each customFields as field (field.id)}
                        {@const teamNumber = wrapped.data.team?.number}
                        <td
                            class="custom-field-cell"
                            class:number-cell={field.type === "float" || field.type === "boolean"}
                        >
                            {#if teamNumber != null}
                                {#if field.type === "boolean"}
                                    <input
                                        type="checkbox"
                                        checked={!!customValues[teamNumber]?.[field.id]}
                                        on:change={(e) => toggleCheckbox(teamNumber, field, e)}
                                    />
                                {:else}
                                    <input
                                        type={field.type === "float" ? "number" : "text"}
                                        step={field.type === "float" ? "any" : undefined}
                                        value={customValues[teamNumber]?.[field.id] ?? ""}
                                        on:input={(e) => onCustomCellInput(teamNumber, field, e)}
                                        on:focus={(e) => e.currentTarget.select()}
                                    />
                                {/if}
                            {/if}
                        </td>
                    {/each}
                </tr>
            {/each}
        </tbody>
    </table>
</div>
{/if}

<style>
    .table-scroll-container {
        flex-grow: 1;
        overflow-y: auto;
    }

    .draggable-table {
        border-spacing: 0;
        border: 1px solid var(--sep-color);
        border-radius: 8px;

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

    .rank-header {
        width: 20px;
        min-width: 20px;
    }

    .rank-cell {
        width: 20px;
        min-width: 20px;
        text-align: center;
        vertical-align: middle;
        font-weight: bold;
        color: var(--stat-text-color);
    }

    .team-row {
        outline: transparent 2px solid;
        outline-offset: -2px;
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

    .custom-fields-manager {
        display: flex;
        align-items: center;
        gap: var(--sm-gap);
        margin-bottom: var(--md-gap);
    }

    .new-field-name {
        padding: var(--sm-pad);
        border: 1px solid var(--sep-color);
        border-radius: 4px;
        background: var(--fg-color);
        color: var(--text-color);
        cursor: text;
        font: inherit;
    }

    .custom-fields-manager select {
        appearance: none;
        -webkit-appearance: none;
        -moz-appearance: none;
        padding: var(--sm-pad) 2rem var(--sm-pad) var(--sm-pad);
        min-width: 6.5rem;
        border: 1px solid var(--sep-color);
        border-radius: 4px;
        background: var(--fg-color)
            url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 8'%3E%3Cpath fill='%23888' d='M1 1l5 5 5-5'/%3E%3C/svg%3E")
            no-repeat right 0.6rem center;
        background-size: 0.7rem;
        color: var(--text-color);
        font: inherit;
        cursor: pointer;
    }

    .add-field-btn {
        padding: var(--sm-pad) var(--md-pad);
        border: 1px solid var(--sep-color);
        border-radius: 4px;
        background: var(--fg-color);
        color: var(--text-color);
        cursor: pointer;
        font: inherit;
    }

    .custom-field-header {
        position: relative;
        min-width: 100px;
    }

    .custom-field-header.number-header {
        min-width: 60px;
    }

    .remove-field-btn {
        background: none;
        border: none;
        color: var(--secondary-text-color);
        cursor: pointer;
        margin-left: 0.4rem;
        font-size: 1rem;
        line-height: 1;
    }

    .custom-field-cell {
        text-align: center;
        padding: var(--sm-pad);
        position: relative;
    }

    .custom-field-cell.number-cell {
        width: 60px;
        max-width: 60px;
    }

    .custom-field-cell input {
        width: 100%;
        min-width: 70px;
        box-sizing: border-box;
        padding: var(--sm-pad);
        border: 1px solid var(--sep-color);
        border-radius: 4px;
        background: var(--fg-color);
        color: var(--text-color);
        text-align: center;
        font: inherit;
    }

    .custom-field-cell input[type="number"] {
        min-width: 50px;
    }

    .custom-field-cell input[type="checkbox"] {
        width: 20px;
        height: 20px;
        min-width: unset;
        cursor: pointer;
    }

    .custom-field-cell input[type="text"]:focus {
        position: absolute;
        z-index: 20;
        left: 50%;
        top: 50%;
        transform: translate(-50%, -50%);
        width: 180px;
        min-width: 100%;
        max-width: 400px;
    }
</style>
