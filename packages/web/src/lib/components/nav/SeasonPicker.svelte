<script lang="ts">
    import { DESCRIPTORS, DESCRIPTORS_LIST, type Season } from "@ftc-scout/common";
    import { faCheck } from "@fortawesome/free-solid-svg-icons";
    import { createEventDispatcher } from "svelte";
    import Fa from "svelte-fa";

    export let season: Season;
    export let disabledValues: Season[] = [];

    const dispatch = createEventDispatcher<{ select: Season }>();

    let open = false;
    let root: HTMLElement;

    $: options = DESCRIPTORS_LIST.slice().reverse();

    function choose(value: Season) {
        open = false;
        if (value != season) dispatch("select", value);
    }

    function outsideClick(e: MouseEvent) {
        if (open && !root.contains(e.target as Node)) open = false;
    }

    function key(e: KeyboardEvent) {
        if (e.key == "Escape") open = false;
    }
</script>

<svelte:window on:click={outsideClick} on:keydown={key} />

<div class="picker" bind:this={root}>
    <button
        id="navbar-season-select"
        class="trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        on:click={() => (open = !open)}
    >
        {DESCRIPTORS[season].seasonNameWithYear}
    </button>

    {#if open}
        <ul class="menu" role="listbox">
            {#each options as option}
                {@const disabled = disabledValues.includes(option.season)}
                <li role="presentation">
                    <button
                        role="option"
                        aria-selected={option.season == season}
                        class:selected={option.season == season}
                        {disabled}
                        on:click={() => choose(option.season)}
                    >
                        <span class="check">
                            {#if option.season == season}<Fa icon={faCheck} size="sm" />{/if}
                        </span>
                        {option.seasonNameWithYear}
                    </button>
                </li>
            {/each}
        </ul>
    {/if}
</div>

<style>
    .picker {
        position: relative;
        display: flex;
    }

    .trigger {
        font-size: inherit;
        font-family: inherit;
        color: inherit;
        white-space: nowrap;

        padding: 10px 30px 10px 12px;
        background-color: var(--fg-color);
        border: 1px solid var(--sep-color);
        border-radius: 4px;
        cursor: pointer;

        /* cspell:disable-next-line */
        background-image: url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e");
        background-repeat: no-repeat;
        background-size: 1.5em 1.5em;
        background-position: right center;
    }

    .trigger:hover {
        background-color: var(--hover-color);
    }

    .trigger:focus-visible {
        outline: 2px solid var(--text-color);
        outline-offset: -1px;
    }

    .menu {
        position: absolute;
        top: calc(100% + 6px);
        left: 0;
        z-index: 1;

        min-width: 100%;
        max-width: calc(100vw - 16px);
        max-height: calc(100vh - var(--navbar-size) - 16px);
        overflow-y: auto;

        margin: 0;
        padding: 4px;
        list-style: none;

        background: var(--raised-bg-color);
        border: 1px solid var(--sep-color);
        border-radius: 8px;
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.35);
    }

    .menu button {
        display: flex;
        align-items: center;
        gap: var(--sm-gap);
        width: 100%;

        font-size: inherit;
        font-family: inherit;
        color: inherit;
        white-space: nowrap;
        text-align: left;

        padding: var(--md-pad) var(--lg-pad);
        background: transparent;
        border: none;
        border-radius: 6px;
        cursor: pointer;
    }

    .menu button:hover:not(:disabled) {
        background: var(--hover-color);
    }

    .menu button.selected {
        font-weight: 600;
    }

    .menu button:disabled {
        color: var(--grayed-out-text-color);
        opacity: 0.55;
        cursor: not-allowed;
    }

    .check {
        display: inline-flex;
        justify-content: center;
        width: 1em;
    }
</style>
