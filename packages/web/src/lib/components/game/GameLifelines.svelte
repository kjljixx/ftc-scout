<script lang="ts">
  import { goto } from "$app/navigation";
  import { page } from "$app/stores";
  import { DESCRIPTORS, type Season } from "@ftc-scout/common";
  import { get } from "svelte/store";
  import { tick } from "svelte";
  import {
    beginRadar, endRadar, game, gamePageContext, lifelinePending,
    requestLifeline, showToast, teamUrl, type GameEvent,
  } from "$lib/game/game-store";
  import Modal from "../Modal.svelte";
  import LifelineIcon from "./LifelineIcon.svelte";

  const lifelines = [
    { id: "radar", name: "Radar", description: "Open one event's rankings and hop to one of its top 10 teams" },
    { id: "crosshair", name: "Crosshair", description: "Find the event with your best next hop" },
    { id: "beacon", name: "Beacon", description: "Reveal your closest connection to the destination" },
  ] as const;
  type LifelineId = typeof lifelines[number]["id"];
  let panel: "radar" | "beacon" | null = null;
  let openingRadar = false;

  $: currentTeam = $game.path[$game.path.length - 1]?.number;
  $: onTeamPage = +$page.params.number === currentTeam && $gamePageContext?.number === currentTeam;
  $: radarActive = !!$game.radarVisit;
  $: canRequest = onTeamPage && !radarActive && !$lifelinePending && !openingRadar;

  function closePanel() {
    panel = null;
  }

  function seasonName(season: number) {
    return DESCRIPTORS[season as Season].seasonName;
  }

  async function activate(id: LifelineId) {
    if (id === "radar") {
      if (radarActive) {
        const url = endRadar();
        if (url) await goto(url);
      } else if (canRequest && !$game.lifelines.radar) panel = "radar";
      return;
    }
    if (id === "crosshair") {
      if ($game.lifelines.crosshair || (canRequest && await requestLifeline(id))) await showEvent();
      return;
    }
    if ($game.lifelines.beacon || (canRequest && await requestLifeline(id))) panel = "beacon";
  }

  async function openEvent(event: GameEvent) {
    const runId = $game.runId;
    const url = beginRadar(event);
    if (!url) return;
    panel = null;
    openingRadar = true;
    try {
      await goto(url);
    } catch (error) {
      console.error(`[game] Radar navigation failed event=${event.season}/${event.code}`, error);
      if (get(game).runId === runId && !get(game).lifelines.radar) {
        const returnUrl = endRadar();
        showToast("Could not open this event. Radar is still available.");
        if (returnUrl) await goto(returnUrl);
      }
    } finally {
      openingRadar = false;
    }
  }

  async function showEvent() {
    const hint = $game.lifelines.crosshair;
    if (!hint || !onTeamPage || hint.from !== currentTeam || radarActive) return;
    panel = null;
    await goto(`${teamUrl(hint.from, hint.event.season)}#crosshair-${encodeURIComponent(hint.event.code)}`);
    await tick();
    document.getElementById(`crosshair-${hint.event.code}`)?.scrollIntoView({ block: "start" });
  }
</script>

<div class="lifelines" role="group" aria-label="Lifelines">
  {#each lifelines as lifeline}
    {@const used = !!$game.lifelines[lifeline.id]}
    {@const active = lifeline.id === "radar" && radarActive}
    {@const pending = $lifelinePending === lifeline.id || (lifeline.id === "radar" && openingRadar)}
    {@const disabled = !!$lifelinePending || openingRadar || (lifeline.id === "radar" ? (!active && (used || !onTeamPage)) : lifeline.id === "crosshair" && used ? (!onTeamPage || $game.lifelines.crosshair?.from !== currentTeam || radarActive) : (!used && !canRequest))}
    {@const status = pending ? "Loading" : active ? "Active; return to team" : used ? "Used" : "One use available"}
    {@const label = `${lifeline.name}: ${status}. ${used && lifeline.id === "crosshair" ? "Show outlined event" : used && lifeline.id === "beacon" ? "View your saved hint" : lifeline.description}`}
    <button
      type="button" class:used class:active class:pending {disabled}
      aria-label={label} title={label} aria-busy={pending}
      on:click={() => activate(lifeline.id)}
    ><LifelineIcon name={lifeline.id} /></button>
  {/each}
</div>

<Modal shown={panel !== null} titleText={panel === "radar" ? "Radar" : "Beacon"} close={closePanel}>
  <div class="lifeline-content">
    {#if panel === "radar"}
      <p>Choose an event. You will see its rankings and can hop to one of its top 10 teams.</p>
      {#if $gamePageContext?.events.length}
        <div class="events">
          {#each $gamePageContext.events as event}
            <button type="button" class="event-option" on:click={() => openEvent(event)}>
              <strong>{event.name}</strong>
              <span>{event.season} · {seasonName(event.season)}</span>
            </button>
          {/each}
        </div>
      {:else}
        <p>Choose a season with events on your team page first. Radar is still available.</p>
      {/if}
    {:else if panel === "beacon" && $game.lifelines.beacon}
      {@const hint = $game.lifelines.beacon}
      <p>
        The beacon points to
        <strong class="beacon-team">{hint.team.number} {hint.team.name}</strong>
        who has played with the target team. They've been marked with a yellow highlight.
      </p>
    {/if}
  </div>
</Modal>

<style>
  .lifelines {
    display: flex;
    flex: none;
    gap: 2px;
  }
  .lifelines > button {
    position: relative;
    width: 44px;
    height: 44px;
    padding: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: 0;
    border-radius: 8px;
    color: var(--inline-theme-color);
    cursor: pointer;
  }
  .lifelines > button:hover:not(:disabled) {
    background: var(--hover-color);
  }
  button:focus-visible {
    outline: 2px solid var(--inline-theme-color);
    outline-offset: 2px;
  }
  .lifelines > button:disabled {
    cursor: default;
  }
  .lifelines > button:disabled,
  .lifelines > button.used:not(.active) {
    color: var(--grayed-out-text-color);
  }
  .active::after {
    content: "";
    position: absolute;
    top: 5px;
    right: 5px;
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: var(--inline-theme-color);
  }
  .pending {
    opacity: 0.5;
  }
  .lifeline-content {
    width: 380px;
    max-width: calc(100vw - 64px);
  }
  p {
    color: var(--grayed-out-text-color);
    line-height: 1.6;
    margin: 0 0 16px;
  }
  .beacon-team {
    display: block;
    margin: 8px 0 12px;
    color: var(--text-color);
    font-size: 22px;
    font-weight: 700;
    line-height: 1.3;
  }
  .events {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .event-option {
    padding: 12px;
    background: none;
    color: var(--text-color);
    border: 0;
    border-radius: 6px;
    cursor: pointer;
    text-align: left;
    font: inherit;
  }
  .event-option:hover {
    background: var(--hover-color);
  }
  .event-option strong,
  .event-option span {
    display: block;
  }
  .event-option span {
    margin-top: 5px;
    color: var(--grayed-out-text-color);
    font-size: 12px;
  }
</style>
