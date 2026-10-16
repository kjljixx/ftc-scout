<script lang="ts">
  import { faEye, faPersonRifle, faShuffle } from "@fortawesome/free-solid-svg-icons";
  import Fa from "svelte-fa";
  import type { PathStop } from "$lib/game/game-store";
  import { FREEZE_SECONDS, SABOTAGE_SECONDS, activeSabotages, castDisorient, castSpy, duelView, sabotageUsed, type SabotageId } from "$lib/game/duel-store";
  import Modal from "../Modal.svelte";
  import RouteView from "./RouteView.svelte";
  import SabotagePicker from "./SabotagePicker.svelte";

  const sabotages = [
    { id: "sniper", name: "Sniper", icon: faPersonRifle, description: `Mark a team. If the opponent hops onto it within ${SABOTAGE_SECONDS} s, the hop fails and all their hops freeze for ${FREEZE_SECONDS} s.` },
    { id: "disorient", name: "Disorient", icon: faShuffle, description: "Move the opponent to a random team that is as far from the destination as their current team, and within 2 hops of it." },
    { id: "spy", name: "Spy", icon: faEye, description: "See the opponent's path." },
  ] as const;

  let panel: "sniper" | "spy" | null = null;
  let spyPath: PathStop[] = [];
  let pendingId: SabotageId | null = null;

  async function activate(id: SabotageId) {
    if (id === "sniper") {
      panel = id;
      return;
    }
    if (pendingId) return;
    pendingId = id;
    if (id === "disorient") {
      await castDisorient();
      pendingId = null;
      return;
    }
    const path = await castSpy();
    pendingId = null;
    if (!path) return;
    spyPath = path;
    panel = "spy";
  }

  function closePanel() {
    panel = null;
  }
</script>

{#if $duelView?.status === "racing"}
  <div class="sabotages" role="group" aria-label="Sabotages">
    {#each sabotages as sabotage}
      {@const used = $sabotageUsed[sabotage.id]}
      {@const active = $activeSabotages.includes(sabotage.id)}
      {@const pending = pendingId === sabotage.id}
      {@const status = pending ? "Loading" : active ? "Active" : used ? "Used" : "One use available"}
      {@const label = `${sabotage.name}: ${status}. ${sabotage.description}`}
      <button
        type="button"
        class:used
        class:active
        class:pending
        disabled={used || !!pendingId}
        aria-label={label}
        title={label}
        aria-busy={pending}
        on:click={() => activate(sabotage.id)}
      ><Fa icon={sabotage.icon} /></button>
    {/each}
  </div>
{/if}

{#if panel === "sniper"}
  <SabotagePicker close={closePanel} />
{:else if panel === "spy"}
  <Modal shown titleText="Spy" close={closePanel}>
    <RouteView title="Opponent's route" path={spyPath} plain links={false} />
  </Modal>
{/if}

<style>
  .sabotages {
    position: relative;
    display: flex;
    flex: none;
    gap: 2px;
    padding-left: 8px;
  }

  .sabotages::before {
    content: "";
    position: absolute;
    left: 0;
    top: 50%;
    width: 1px;
    height: 24px;
    transform: translateY(-50%);
    background: var(--sep-color);
  }

  button {
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
    color: #e0701e;
    font-size: 23px;
    cursor: pointer;
  }

  button:hover:not(:disabled) {
    background: var(--hover-color);
  }

  button:focus-visible {
    outline: 2px solid var(--inline-theme-color);
    outline-offset: 2px;
  }

  button:disabled {
    cursor: default;
  }

  button:disabled:not(.active),
  button.used:not(.active) {
    color: var(--grayed-out-text-color);
  }

  button.active::after {
    content: "";
    position: absolute;
    top: 5px;
    right: 5px;
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: currentColor;
  }

  button.pending {
    opacity: 0.5;
  }
</style>
