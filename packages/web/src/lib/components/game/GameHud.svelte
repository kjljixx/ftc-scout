<script lang="ts">
    import { goto } from "$app/navigation";
    import { faFlag } from "@fortawesome/free-solid-svg-icons";
    import Fa from "svelte-fa";
    import { clock, formatClock, game, gameActive, resetGame } from "$lib/game/game-store";
    import Button from "../ui/Button.svelte";
    import GameTeam from "./GameTeam.svelte";

    const SHOWN_STOPS = 4;

    function giveUp() {
        resetGame();
        goto("/speedrun");
    }

    $: pair = $game.pair;
    $: hops = $game.path.length - 1;
    $: shownStops = $game.path.slice(-SHOWN_STOPS);
    $: elapsed = ($clock - ($game.startedAt ?? $clock)) | 0;
</script>

{#if $gameActive && pair}
    <div class="hud">
        <div class="inner">
            <span class="flag"><Fa icon={faFlag} size="1.5x" /></span>

            <div class="dest"><GameTeam team={pair.destination} size="hud" /></div>

            <div class="path">
                {#if $game.path.length > SHOWN_STOPS}<span>&hellip;</span>{/if}
                {#each shownStops as stop, i}
                    {#if i > 0 || $game.path.length > SHOWN_STOPS}<span>&rsaquo;</span>{/if}
                    <span class:current={i == shownStops.length - 1}>{stop.number}</span>
                {/each}
            </div>

            <div class="clock">
                <b>{formatClock(elapsed)}</b>
                <span>{hops} {hops == 1 ? "hop" : "hops"}</span>
            </div>

            <Button on:click={giveUp}>Give up</Button>
        </div>
    </div>
{/if}

<style>
    .hud {
        position: fixed;
        top: var(--navbar-size);
        left: 0;
        right: 0;
        height: var(--hud-size);
        z-index: 800;

        padding: 0 var(--lg-pad);

        background: var(--fg-color);
        border-bottom: 1px solid var(--sep-color);
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.35);
    }

    .inner {
        display: flex;
        align-items: center;
        gap: var(--vl-gap);

        height: 100%;
        max-width: 1000px;
        margin: 0 auto;
    }

    .flag {
        color: var(--inline-theme-color);
    }

    .dest {
        flex: 1;
        min-width: 0;
    }

    .path {
        display: flex;
        align-items: center;
        gap: var(--sm-gap);
        color: var(--grayed-out-text-color);
    }

    .path .current {
        color: var(--text-color);
        font-weight: 600;

        border: 1px solid var(--focused-team-ring-color);
        border-radius: 6px;
        padding: 0 6px;
    }

    .clock {
        text-align: right;
        line-height: 1.15;
    }

    .clock b {
        display: block;
        font-size: calc(var(--lg-font-size) * 1.2);
        font-variant-numeric: tabular-nums;
    }

    .clock span {
        font-size: 0.9em;
        color: var(--grayed-out-text-color);
    }

    @media (max-width: 700px) {
        .path,
        .flag {
            display: none;
        }
    }
</style>
