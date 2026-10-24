<script lang="ts">
    import {
        SetEventPicklistDocument,
        AddCustomFieldDocument,
        RemoveCustomFieldDocument,
        SetCustomFieldValueDocument,
        type EventPageQuery,
    } from "$lib/graphql/generated/graphql-operations";
    import { Color, DESCRIPTORS, getTepStatSet, type Season } from "@ftc-scout/common";
    import { faGripVertical } from "@fortawesome/free-solid-svg-icons";
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
    import Button from "$lib/components/Button.svelte";
    import ConfirmModal from "$lib/components/ConfirmModal.svelte";
    import Card from "$lib/components/Card.svelte";
    import WidthProvider from "$lib/components/WidthProvider.svelte";
    import { team } from "$lib/team/team-store";
    import { browser } from "$app/environment";

    const WIDTHS_STORAGE_KEY = "picklist-column-widths";
    const MIN_COLUMN_WIDTH = 50;
    const MAX_COLUMN_WIDTH = 600;
    const RANK_COLUMN_WIDTH = 32;
    const HANDLE_COLUMN_WIDTH = 24;
    const TEAM_COLUMN_WIDTH = 200;
    const STAT_COLUMN_WIDTH = 100;
    const TABLE_BORDER_WIDTH = 2;
    const TEXT_FIELD_WIDTH = 150;
    const HEADER_CHAR_WIDTH = 8;
    const HEADER_EXTRA_WIDTH = 56;
    const NUMBER_FIELD_WIDTH = 70;

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

    let containerWidth = 0;

    function sumWidths(cols: { width: number }[]) {
        return RANK_COLUMN_WIDTH + HANDLE_COLUMN_WIDTH + cols.reduce((sum, c) => sum + c.width, 0);
    }

    function withColor(stat: ReturnType<typeof stats.getStat>, color: Color) {
        return stat && Object.assign(Object.create(Object.getPrototypeOf(stat)), stat, { color });
    }

    $: if ($picklistState.loaded) customFields = $picklistState.customFields;
    $: applyPicklistState($picklistState);

    $: columnStats = Object.fromEntries(
        defaultStats.map((id) => {
            let stat = stats.getStat(id);
            return [id, id === "eventRank" ? withColor(stat, Color.Blue) : stat];
        })
    );

    $: baseColumns = [
        ...defaultStats.map((key) => ({
            key,
            width: (!isColoredStat(key) && columnWidths[key]) || defaultStatWidth(key),
        })),
        ...customFields.map((field) => ({
            key: field.id,
            width: columnWidths[field.id] ?? defaultFieldWidth(field),
        })),
    ];
    $: teamSlack =
        columnWidths["team"] == null
            ? Math.max(0, containerWidth - TABLE_BORDER_WIDTH - sumWidths(baseColumns))
            : 0;
    $: columns = baseColumns.map((c) =>
        c.key === "team" ? { ...c, width: c.width + teamSlack } : c
    );
    $: totalWidth = sumWidths(columns);

    let draggedIndex: number | null = null;
    let dropGap: number | null = null;

    let teamOrder: number[] = [];

    let touchStartIdx: number | null = null;
    let lastTouchX = 0;
    let lastTouchY = 0;

    let content = document.getElementById("content");

    let lastSyncedOrder: number[] | null = null;
    let saveTimeout: ReturnType<typeof setTimeout> | null = null;

    let customFields: CustomFieldTy[] = [];
    let customValues: Record<number, Record<string, string | number | boolean>> = {};
    let pendingValueKeys = new Set<string>();
    let valueSaveTimeouts: Record<string, ReturnType<typeof setTimeout>> = {};

    let fieldToRemove: CustomFieldTy | null = null;

    let columnWidths: Record<string, number> = loadColumnWidths();
    let resizingKey: string | null = null;

    let newFieldName = "";
    let newFieldType: string = "string";

    function loadColumnWidths(): Record<string, number> {
        if (!browser) return {};
        try {
            let parsed = JSON.parse(localStorage.getItem(WIDTHS_STORAGE_KEY) ?? "{}");
            let widths: Record<string, number> = {};
            for (let [key, value] of Object.entries(parsed)) {
                if (typeof value === "number" && Number.isFinite(value)) widths[key] = value;
            }
            console.info(`[picklist widths] loaded ${Object.keys(widths).length} saved widths`);
            return widths;
        } catch (error) {
            console.warn("[picklist widths] saved widths are malformed, using defaults:", error);
            return {};
        }
    }

    function saveColumnWidths() {
        localStorage.setItem(WIDTHS_STORAGE_KEY, JSON.stringify(columnWidths));
        console.info(`[picklist widths] saved ${Object.keys(columnWidths).length} widths`);
    }

    function defaultStatWidth(statId: string) {
        return statId === "team" ? TEAM_COLUMN_WIDTH : STAT_COLUMN_WIDTH;
    }

    function isColoredStat(statId: string | undefined) {
        let color = statId ? columnStats[statId]?.color : null;
        return !!color && color !== Color.White;
    }

    function defaultFieldWidth(field: CustomFieldTy) {
        let minWidth = field.type === "string" ? TEXT_FIELD_WIDTH : NUMBER_FIELD_WIDTH;
        let headerWidth = field.name.length * HEADER_CHAR_WIDTH + HEADER_EXTRA_WIDTH;
        return Math.min(MAX_COLUMN_WIDTH, Math.max(minWidth, headerWidth));
    }

    function resetColumnWidth(key: string) {
        let { [key]: _removed, ...rest } = columnWidths;
        columnWidths = rest;
        saveColumnWidths();
        console.info(`[picklist widths] reset ${key}`);
    }

    function startResize(e: PointerEvent, key: string) {
        e.preventDefault();
        e.stopPropagation();
        let handle = e.currentTarget as HTMLElement;
        handle.setPointerCapture(e.pointerId);
        let startX = e.clientX;
        let startWidth = columns.find((c) => c.key === key)?.width ?? MIN_COLUMN_WIDTH;
        resizingKey = key;

        function onMove(move: PointerEvent) {
            let width = startWidth + move.clientX - startX;
            columnWidths = {
                ...columnWidths,
                [key]: Math.round(Math.min(MAX_COLUMN_WIDTH, Math.max(MIN_COLUMN_WIDTH, width))),
            };
        }

        function onEnd() {
            handle.removeEventListener("pointermove", onMove);
            handle.removeEventListener("pointerup", onEnd);
            handle.removeEventListener("pointercancel", onEnd);
            resizingKey = null;
            saveColumnWidths();
        }

        handle.addEventListener("pointermove", onMove);
        handle.addEventListener("pointerup", onEnd);
        handle.addEventListener("pointercancel", onEnd);
    }

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
        applyRemoteValues(state.customValues);
    }

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

        if (fieldId in columnWidths) resetColumnWidth(fieldId);
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

    function gapAtPointer(row: HTMLElement, index: number, clientY: number): number | null {
        const rect = row.getBoundingClientRect();
        const gap = clientY < rect.top + rect.height / 2 ? index : index + 1;
        const isNoop = draggedIndex === null || gap === draggedIndex || gap === draggedIndex + 1;
        return isNoop ? null : gap;
    }

    function moveTeam(from: number, gap: number) {
        const updatedOrder = [...teamOrder];
        const [movedItem] = updatedOrder.splice(from, 1);
        updatedOrder.splice(gap > from ? gap - 1 : gap, 0, movedItem);

        teamOrder = updatedOrder;
        queuePicklistSave(updatedOrder);
    }

    function handleDragOver(event: DragEvent, index: number) {
        event.preventDefault();
        dropGap = gapAtPointer(event.currentTarget as HTMLElement, index, event.clientY);
    }

    function handleDrop(event: DragEvent) {
        event.preventDefault();
        if (draggedIndex !== null && dropGap !== null) moveTeam(draggedIndex, dropGap);
        resetDragState();
    }

    function resetDragState() {
        draggedIndex = null;
        dropGap = null;
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
            dropGap = gapAtPointer(row, parseInt(row.dataset.index, 10), lastTouchY);
        } else {
            dropGap = null;
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
        if (touchStartIdx !== null && dropGap !== null) moveTeam(touchStartIdx, dropGap);
        touchStartIdx = null;
        resetDragState();
    }
</script>

<div class="gate">
<div class="gated" class:locked={!$team} inert={!$team}>
{#if !$picklistState.loaded}
    <Skeleton />
{:else}
<div class="custom-fields-manager">
    <input
        class="non-form"
        type="text"
        placeholder="New field name"
        bind:value={newFieldName}
        on:keydown={(e) => e.key === "Enter" && addCustomField()}
    />
    <select class="non-form" bind:value={newFieldType}>
        <option value="string">Text</option>
        <option value="float">Number</option>
        <option value="boolean">Checkbox</option>
    </select>
    <Button variant="secondary" on:click={addCustomField}>Add Field</Button>
</div>

<div class="table-scroll-container" bind:clientWidth={containerWidth}>
    <table
        class="draggable-table"
        class:resizing={resizingKey != null}
        style:width="{totalWidth}px"
    >
        <colgroup>
            <col style:width="{RANK_COLUMN_WIDTH}px" />
            <col style:width="{HANDLE_COLUMN_WIDTH}px" />
            {#each columns as column (column.key)}
                <col style:width="{column.width}px" />
            {/each}
        </colgroup>
        <thead>
            <tr>
                <th class="rank-header">#</th>
                <th class="drag-handle-header empty" />
                {#each defaultStats as statId, i}
                    {@const stat = columnStats[statId]}
                    <th class={stat?.color ?? ""}>
                        <span class="header-label" title={stat?.titleName ?? statId}>
                            {stat?.columnName ?? statId}
                        </span>
                        {#if !isColoredStat(statId) && !isColoredStat(defaultStats[i + 1])}
                            <span
                                class="resize-handle"
                                role="separator"
                                title="Drag to resize, double-click to reset"
                                on:pointerdown={(e) => startResize(e, statId)}
                                on:dblclick={() => resetColumnWidth(statId)}
                            />
                        {/if}
                    </th>
                {/each}
                {#each customFields as field (field.id)}
                    <th class="custom-field-header">
                        <span class="custom-field-name" title={field.name}>{field.name}</span>
                        <button
                            class="remove-field-btn"
                            title="Remove field"
                            on:click={() => (fieldToRemove = field)}
                        >
                            ×
                        </button>
                        <span
                            class="resize-handle"
                            role="separator"
                            title="Drag to resize, double-click to reset"
                            on:pointerdown={(e) => startResize(e, field.id)}
                            on:dblclick={() => resetColumnWidth(field.id)}
                        />
                    </th>
                {/each}
            </tr>
        </thead>
        <tbody>
            {#each wrappedOrderedData as wrapped, index (wrapped.data.team?.number ?? index)}
                <tr
                    class="team-row"
                    class:dragging={draggedIndex === index}
                    class:drop-before={dropGap === index}
                    class:drop-after={dropGap === index + 1 &&
                        index === wrappedOrderedData.length - 1}
                    data-index={index}
                    draggable="true"
                    on:dragstart={(e) => handleDragStart(e, index)}
                    on:dragover={(e) => handleDragOver(e, index)}
                    on:drop={handleDrop}
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
                            <Fa icon={faGripVertical} scale="1.0x" />
                        </span>
                    </td>
                    {#each defaultStats as statId}
                        <StatCell data={wrapped} stat={columnStats[statId]} {focusedTeam} />
                    {/each}
                    {#each customFields as field (field.id)}
                        {@const teamNumber = wrapped.data.team?.number}
                        <td class="custom-field-cell">
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
</div>

{#if !$team}
    <div class="cover">
        <WidthProvider width="520px">
            <Card vis>
                <div class="gate-title">Create / Join a team to use the picklist</div>
                <div class="gate-sub">Look in the sidebar</div>
            </Card>
        </WidthProvider>
    </div>
{/if}
</div>

<ConfirmModal
    shown={fieldToRemove != null}
    titleText="Delete field?"
    close={() => (fieldToRemove = null)}
    on:confirm={() => fieldToRemove && removeCustomField(fieldToRemove.id)}
>
    Delete "{fieldToRemove?.name}" and its values for every team? This can't be undone.
</ConfirmModal>

<style>
    .gate {
        position: relative;
    }

    .gated.locked {
        filter: blur(4px);
        user-select: none;
    }

    .cover {
        position: absolute;
        inset: 0;
        display: flex;
        justify-content: center;
        align-items: flex-start;
        padding-top: 80px;
        z-index: var(--hovered-row-zi);
    }

    .gate-title {
        font-size: var(--vl-font-size);
        font-weight: 700;
        text-align: center;
        margin-bottom: var(--md-gap);
    }

    .gate-sub {
        color: var(--secondary-text-color);
        text-align: center;
    }

    .table-scroll-container {
        flex-grow: 1;
        overflow-y: auto;
    }

    .draggable-table {
        border-spacing: 0;
        border: 1px solid var(--sep-color);
        border-radius: 8px;

        table-layout: fixed;
        position: relative;
        background-color: var(--fg-color);
    }

    .draggable-table.resizing {
        cursor: col-resize;
        user-select: none;
    }

    .draggable-table tbody :global(td) {
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .draggable-table tbody :global(td.custom-field-cell) {
        overflow: visible;
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
        position: relative;
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

    .header-label {
        display: block;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: normal;
    }

    .resize-handle {
        position: absolute;
        top: 0;
        left: 100%;
        z-index: 1;
        width: 8px;
        height: 100%;
        cursor: col-resize;
        touch-action: none;
    }

    .draggable-table th:last-child .resize-handle {
        left: auto;
        right: -4px;
    }

    .resize-handle::after {
        content: "";
        position: absolute;
        top: 25%;
        left: 3px;
        width: 2px;
        height: 50%;
        border-radius: 1px;
        background: var(--secondary-text-color);
        opacity: 0.5;
    }

    .resize-handle:hover::after {
        opacity: 1;
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

    .rank-header,
    .drag-handle-header {
        padding-left: 0;
        padding-right: 0;
    }

    .rank-cell {
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

    .team-row.drop-before :global(td) {
        box-shadow: inset 0 3px 0 var(--blue-stat-color);
    }

    .team-row.drop-after :global(td) {
        box-shadow: inset 0 -3px 0 var(--blue-stat-color);
    }

    .drag-handle-cell {
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
        gap: var(--md-gap);
        margin-bottom: var(--md-gap);
    }

    .custom-fields-manager input {
        cursor: text;
    }

    .custom-field-name {
        display: inline-block;
        max-width: calc(100% - 1.6rem);
        overflow: hidden;
        text-overflow: ellipsis;
        vertical-align: bottom;
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

    .custom-field-cell input {
        width: 100%;
        box-sizing: border-box;
        padding: var(--sm-pad);
        border: 1px solid var(--sep-color);
        border-radius: 4px;
        background: var(--fg-color);
        color: var(--text-color);
        text-align: center;
        font: inherit;
    }

    .custom-field-cell input[type="checkbox"] {
        width: 20px;
        height: 20px;
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
