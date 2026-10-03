<script lang="ts" context="module">
    export const TAB_CONTEXT = {};
</script>

<script lang="ts">
    import type { IconDefinition } from "@fortawesome/free-solid-svg-icons";
    import { setContext } from "svelte";
    import { writable } from "svelte/store";
    import Card from "../Card.svelte";
    import Fa from "svelte-fa";

    export let tabs: [icon: IconDefinition, name: string, id: string, shown: boolean][];
    $: shownTabs = tabs.filter((n) => n[3]);

    export let selectedTab: string;
    let selectedTabStore = writable(selectedTab);
    $: $selectedTabStore = selectedTab;
    setContext(TAB_CONTEXT, selectedTabStore);

    $: if (!shownTabs.some((t) => t[2] == selectedTab) && shownTabs.length)
        selectedTab = shownTabs[0][2];
</script>

{#if shownTabs.length}
    <Card vis={false}>
        <div class="tabs">
            {#each shownTabs as [icon, name, id]}
                <a
                    class="tab"
                    class:selected={id == selectedTab}
                    on:click|preventDefault={() => (selectedTab = id)}
                    href={id}
                >
                    <Fa {icon} scale="0.75x" />
                    <span class="maybe-hide"> {name} </span>
                </a>
            {/each}
        </div>

        <div class="card">
            <slot />
        </div>
    </Card>
{:else}
    <slot name="empty" />
{/if}

<style>
    .tabs {
        display: flex;
        gap: var(--vl-gap);
        align-items: center;
        justify-content: left;
    }

    .tab {
        font-size: var(--lg-font-size);
        font-weight: 500;
        color: var(--grayed-out-text-color);

        padding: var(--md-pad) 0;
        border-bottom: 2px solid transparent;

        cursor: pointer;
    }

    .tab:hover {
        text-decoration: none;
        color: var(--text-color);
    }

    .tab.selected {
        font-weight: 600;
        color: var(--text-color);
        border-bottom-color: var(--inline-theme-color);
    }

    .card {
        background-color: var(--fg-color);
        border-radius: 12px;

        margin-top: var(--md-gap);
        padding: var(--lg-pad);
    }

    @media (max-width: 650px) {
        .tab:not(.selected) .maybe-hide {
            display: none;
        }
    }
</style>
