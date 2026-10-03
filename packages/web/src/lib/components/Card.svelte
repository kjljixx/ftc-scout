<script lang="ts">
    import { getContext } from "svelte";
    import { REQUESTED_WIDTH } from "./WidthProvider.svelte";
    import type { Readable } from "svelte/store";

    export let style = "";
    export let vis = true;
    export let panel = false;

    let requestedWidth: Readable<string> = getContext(REQUESTED_WIDTH);
</script>

<div style:--requested-width={$requestedWidth} {style} class:vis class:panel>
    <slot />
</div>

<style>
    div {
        margin: var(--lg-gap) auto;
        margin-bottom: var(--vl-gap);

        --side-gap: var(--lg-gap);

        position: relative;
        width: min-content;
        max-width: calc(100% - 2 * var(--side-gap));
        min-width: min(var(--requested-width), 100% - 2 * var(--side-gap));
    }

    .vis {
        background-color: var(--fg-color);
        border: 1px solid var(--sep-color);
        border-radius: 8px;

        padding: var(--lg-pad);
    }

    .vis.panel {
        border: none;
        border-radius: 12px;
    }

    @media (max-width: 550px) {
        div {
            --side-gap: var(--md-gap);
        }
    }
</style>
