<script lang="ts">
    import StatCell from "./StatCell.svelte";
    import type { StatColumn, StatData } from "@ftc-scout/common";
    import { createEventDispatcher, getContext } from "svelte";
    import { radarReach } from "$lib/game/game-store";
    import { TEAM_CLICK_ACTION_CTX } from "../matches/MatchTeam.svelte";

    type T = $$Generic;

    export let data: StatData<T>;
    export let stats: StatColumn<T>[];
    export let focusedTeam: number | null;
    export let rankStat: StatColumn<T> | null;

    let dispatch = createEventDispatcher();
    let clickAction = getContext(TEAM_CLICK_ACTION_CTX) as
        | ((num: number, name: string, eventCode: string | null) => void)
        | undefined;

    $: teamNumber = (data.data as { teamNumber?: number }).teamNumber;
    $: radarRow = $radarReach !== null && teamNumber !== undefined;
    $: locked = radarRow && !$radarReach!.includes(teamNumber!);

    function rowClick() {
        if (radarRow && clickAction) clickAction(teamNumber!, "", null);
        else dispatch("row_click", data);
    }
</script>

<tr class:radar-locked={locked} on:click={rowClick}>
    {#if rankStat}
        <StatCell {data} stat={rankStat} {focusedTeam} />
    {/if}

    {#each stats as stat}
        <StatCell {data} {stat} {focusedTeam} />
    {/each}
</tr>

<style>
    tr {
        outline: transparent 2px solid;
        outline-offset: -2px;
        transition: outline 0.12s ease 0s;

        cursor: pointer;
    }

    tr.radar-locked {
        cursor: not-allowed;
    }

    tr.radar-locked :global(td) {
        opacity: 0.38;
        filter: grayscale(0.8);
        outline-color: transparent !important;
    }

    tr.radar-locked :global(a) {
        cursor: not-allowed;
    }

    tr.radar-locked {
        outline-color: transparent !important;
    }

    @supports selector(tr:has(td)) {
        tr:hover:not(:has(td.inner-hover:hover)) {
            outline: 2px solid var(--neutral-team-color);
            z-index: var(--focused-row-zi);
        }
    }

    @supports not selector(tr:has(td)) {
        tr:hover {
            outline: 2px solid var(--neutral-team-color);
            z-index: var(--focused-row-zi);
        }
    }
</style>
