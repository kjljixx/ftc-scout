<script lang="ts">
    import { createTippy } from "svelte-tippy";
    import "tippy.js/dist/tippy.css";
    import { DESCRIPTORS, type Season } from "@ftc-scout/common";
    import { tippyTheme } from "$lib/components/nav/DarkModeToggle.svelte";
    import { HIDDEN_TIP } from "$lib/util/tippy";
    import type { Hop, PathStop } from "$lib/game/game-store";

    export let title: string;
    export let path: PathStop[] | null;
    export let note = "";
    export let badge: { text: string; good: boolean } | null = null;
    export let stuckAtEnd = false;

    const tippy = createTippy({ placement: "top", touch: ["hold", 500] });

    function hopTip(hop: Hop | undefined, theme: "light" | "dark") {
        if (!hop) return HIDDEN_TIP;
        let lines = [
            hop.eventName,
            `${hop.season} ${DESCRIPTORS[hop.season as Season]?.seasonName ?? ""} · ${hop.match}`,
            hop.relation,
        ];
        let content = document.createElement("div");
        lines.forEach((text, i) => {
            if (!text) return;
            let line = document.createElement("div");
            line.textContent = text;
            if (i == 0) line.style.fontWeight = "600";
            content.append(line);
        });
        return { content, theme, maxWidth: 350 };
    }

    $: hops = path ? path.length - 1 : 0;
    $: hopsText = path ? `${hops} ${hops == 1 ? "hop" : "hops"}` : note;
</script>

<div class="card">
    <div class="head">
        <b>{title}</b>
        <span class="hops">{hopsText}</span>
        {#if badge}<span class="badge" class:good={badge.good}>{badge.text}</span>{/if}
    </div>

    {#if path}
        <div class="route">
            {#each path as stop, i}
                {#if i > 0}
                    <!-- svelte-ignore a11y-no-noninteractive-tabindex -->
                    <span
                        class="chev"
                        class:has-hop={!!stop.hop}
                        tabindex={stop.hop ? 0 : -1}
                        use:tippy={hopTip(stop.hop, $tippyTheme)}
                    >
                        &rsaquo;
                    </span>
                {/if}
                {@const stuck = stuckAtEnd && i == path.length - 1}
                <div
                    class="stop"
                    class:end={!stuck && (i == 0 || i == path.length - 1)}
                    class:stuck
                >
                    <b>{stop.number}</b>
                    <span>{stop.name}</span>
                </div>
            {/each}
        </div>
    {/if}
</div>

<style>
    .card {
        max-width: 1000px;
        margin: var(--lg-gap) auto;
        padding: var(--lg-pad);

        background: var(--fg-color);
        border: 1px solid var(--sep-color);
        border-radius: 12px;
    }

    .head {
        display: flex;
        align-items: baseline;
        gap: var(--md-gap);
    }

    .head b {
        font-weight: 600;
    }

    .hops {
        color: var(--grayed-out-text-color);
    }

    .badge {
        margin-left: auto;
        padding: 1px 10px;

        border: 1px solid var(--sep-color);
        border-radius: var(--pill-border-radius);

        font-size: 0.9em;
        color: var(--grayed-out-text-color);
    }

    .badge.good {
        border-color: var(--focused-team-ring-color);
        color: var(--text-color);
    }

    .route {
        display: flex;
        justify-content: center;
        align-items: center;
        flex-wrap: wrap;
        gap: var(--lg-gap);

        padding-top: var(--md-pad);
    }

    .stop {
        display: flex;
        flex-direction: column;
        align-items: center;
        line-height: 1.25;
    }

    .stop span {
        max-width: 130px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;

        font-size: 0.85em;
        color: var(--grayed-out-text-color);
    }

    .stop.end b {
        color: var(--focused-team-ring-color);
    }

    .stop.stuck b {
        color: var(--red-team-color);
    }

    .chev {
        padding: 2px 10px;
        border-radius: 8px;

        font-size: var(--lg-font-size);
        color: var(--grayed-out-text-color);
        user-select: none;
    }

    .chev.has-hop {
        cursor: help;
    }

    .chev.has-hop:hover,
    .chev.has-hop:focus-visible {
        color: var(--text-color);
        background: var(--hover-color);
        outline: none;
    }
</style>
