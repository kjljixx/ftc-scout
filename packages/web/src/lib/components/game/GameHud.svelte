<script lang="ts">
  import { goto } from "$app/navigation";
  import { faFlag } from "@fortawesome/free-solid-svg-icons";
  import Fa from "svelte-fa";
  import { clock, formatClock, game, gameActive, giveUp } from "$lib/game/game-store";
  import Button from "../ui/Button.svelte";
  import GameTeam from "./GameTeam.svelte";
  import GameLifelines from "./GameLifelines.svelte";

  const SHOWN_STOPS = 4;

  function giveUpAndShowResults() {
    giveUp();
    goto("/speedrun");
  }

  $: pair = $game.pair;
  $: hops = $game.path.length - 1;
  $: shownStops = $game.path.slice(-SHOWN_STOPS);
  $: elapsed = ($clock - ($game.startedAt ?? $clock)) | 0;
</script>

{#if $gameActive && pair}
  <div class="hud" role="region" aria-label="Game status">
    <div class="inner">
      <section class="destination" aria-label="Destination">
        <span class="flag"><Fa icon={faFlag} /></span>
        <div class="destination-copy">
          <GameTeam team={pair.destination} size="hud" />
        </div>
      </section>

      <div class="path-group" role="group" aria-label="Recent path">
        <div class="path">
          {#if $game.path.length > SHOWN_STOPS}<span>&hellip;</span>{/if}
          {#each shownStops as stop, i}
            {#if i > 0 || $game.path.length > SHOWN_STOPS}<span aria-hidden="true">&rsaquo;</span>{/if}
            <span class:current={i === shownStops.length - 1}>{stop.number}</span>
          {/each}
        </div>
      </div>

      <div class="clock" role="group" aria-label="Time and hops">
        <b aria-label="Elapsed time">{formatClock(elapsed)}</b>
        <span>{hops} {hops === 1 ? "hop" : "hops"}</span>
      </div>

      <div class="actions" role="group" aria-label="Actions">
        <GameLifelines />
        <span class="give-up"><Button on:click={giveUpAndShowResults}>Give up</Button></span>
        <button class="give-up-icon" type="button" aria-label="Give up" title="Give up" on:click={giveUpAndShowResults}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="m6 6 12 12M6 18 18 6" /></svg>
        </button>
      </div>
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
    padding: 0 20px;
    background: var(--fg-color);
    border-bottom: 1px solid var(--sep-color);
  }

  .inner {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto auto auto;
    align-items: center;
    gap: 20px;
    height: 100%;
    max-width: 1100px;
    margin: 0 auto;
  }

  .destination {
    display: flex;
    align-items: center;
    gap: 12px;
    min-width: 0;
  }

  .flag {
    flex: none;
    color: var(--inline-theme-color);
    font-size: 22px;
  }

  .destination-copy {
    min-width: 0;
  }

  .path-group,
  .actions {
    position: relative;
    padding-left: 20px;
  }

  .path-group {
    min-width: 0;
  }

  .path-group::before,
  .actions::before {
    content: "";
    position: absolute;
    left: 0;
    top: 50%;
    width: 1px;
    height: 40px;
    transform: translateY(-50%);
    background: var(--sep-color);
  }

  .path {
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--grayed-out-text-color);
    font-size: var(--lg-font-size);
    white-space: nowrap;
    justify-content: flex-end;
    overflow: hidden;
  }

  .path > span {
    flex: none;
  }

  .path .current {
    color: var(--text-color);
    font-weight: 600;
  }

  .clock {
    text-align: right;
    line-height: 1.15;
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }

  .clock b {
    display: block;
    font-size: calc(var(--lg-font-size) * 1.2);
  }

  .clock span {
    font-size: 0.9em;
    color: var(--grayed-out-text-color);
  }

  .actions {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .give-up-icon {
    display: none;
    flex: none;
    width: 32px;
    height: 44px;
    align-items: center;
    justify-content: center;
    padding: 0;
    background: none;
    border: 0;
    color: var(--grayed-out-text-color);
    cursor: pointer;
  }

  .give-up-icon:hover,
  .give-up-icon:focus-visible {
    color: var(--text-color);
  }

  @media (max-width: 850px) {
    .inner {
      grid-template-columns: minmax(0, 1fr) auto auto;
      gap: 12px;
      padding: 12px 0;
      box-sizing: border-box;
    }

    .destination {
      grid-column: 1 / -1;
      padding-bottom: 12px;
      border-bottom: 1px solid var(--sep-color);
    }

    .path-group {
      padding-left: 0;
    }

    .path-group::before {
      display: none;
    }

    .actions {
      gap: 8px;
      padding-left: 12px;
    }
  }

  @media (max-width: 600px) {
    .hud {
      padding: 0 12px;
    }

    .inner {
      grid-template-columns: minmax(0, 1fr) auto;
    }

    .path-group {
      grid-column: 1 / -1;
      grid-row: 2;
    }

    .clock {
      grid-column: 1;
      grid-row: 3;
      text-align: left;
    }

    .actions {
      grid-column: 2;
      grid-row: 3;
    }

    .give-up {
      display: none;
    }

    .give-up-icon {
      display: flex;
    }
  }
</style>
