<script lang="ts">
  import { createEventDispatcher, onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { faArrowRightArrowLeft } from "@fortawesome/free-solid-svg-icons";
  import Fa from "svelte-fa";
  import { getClient } from "$lib/graphql/client";
  import { TeamsSearchDocument, type TeamsSearchTeamFragment } from "$lib/graphql/generated/graphql-operations";
  import { fetchCustomPair, startGame, startUrl } from "$lib/game/game-store";
  import GameTeamPicker from "./GameTeamPicker.svelte";

  const dispatch = createEventDispatcher<{ busy: boolean }>();
  let teams: TeamsSearchTeamFragment[] = [];
  let startTeam: TeamsSearchTeamFragment | null = null;
  let endTeam: TeamsSearchTeamFragment | null = null;
  let loadingTeams = true;
  let loadError: string | null = null;
  let error: string | null = null;
  let submitting = false;
  let destroyed = false;
  let controller: AbortController | null = null;

  $: duplicate = !!startTeam && !!endTeam && startTeam.number === endTeam.number;
  $: disabled = loadingTeams || !!loadError || submitting;

  onMount(() => {
    loadTeams();
    return () => {
      destroyed = true;
      controller?.abort();
    };
  });

  async function loadTeams() {
    loadingTeams = true;
    loadError = null;
    try {
      const result = await getClient(fetch).query({ query: TeamsSearchDocument });
      if (destroyed) return;
      teams = result.data.teamsSearch;
      console.info(`[game] custom setup teams=${teams.length} search=number-or-name connectionCheck=shared-matches`);
    } catch (cause) {
      console.error("[game] custom setup team search failed", cause);
      if (!destroyed) loadError = "Could not load teams. Try again.";
    } finally {
      if (!destroyed) loadingTeams = false;
    }
  }

  function swapTeams() {
    [startTeam, endTeam] = [endTeam, startTeam];
    error = null;
  }

  async function startCustomGame() {
    if (disabled || duplicate || !startTeam || !endTeam) return;
    const from = startTeam.number;
    const to = endTeam.number;
    submitting = true;
    error = null;
    controller = new AbortController();
    dispatch("busy", true);
    try {
      const pair = await fetchCustomPair(from, to, controller.signal);
      if (destroyed) return;
      startGame(pair);
      await goto(startUrl(pair));
    } catch (cause) {
      if (destroyed) return;
      console.error(`[game] custom setup failed ${from}>${to}`, cause);
      error = cause instanceof Error ? cause.message : "Could not start this run. Try again.";
    } finally {
      if (!destroyed) {
        submitting = false;
        dispatch("busy", false);
      }
    }
  }
</script>

<form on:submit|preventDefault={startCustomGame} aria-label="Choose start and end teams" aria-busy={loadingTeams || submitting}>
  <div class="team-pickers">
    <GameTeamPicker id="custom-start-team" label="Start team" {teams} bind:team={startTeam} {disabled} on:change={() => error = null} />
    <button class="swap" type="button" {disabled} aria-label="Swap start and end teams" title="Swap teams" on:click={swapTeams}><Fa icon={faArrowRightArrowLeft} /></button>
    <GameTeamPicker id="custom-end-team" label="End team" {teams} bind:team={endTeam} {disabled} on:change={() => error = null} />
  </div>
  {#if loadingTeams}<p class="status" role="status">Loading teams…</p>{/if}
  {#if loadError}<p class="error" role="alert">{loadError} <button type="button" class="retry" on:click={loadTeams}>Retry</button></p>{/if}
  {#if duplicate}<p class="error" role="alert">Choose two different teams.</p>{/if}
  {#if error}<p class="error" role="alert">{error}</p>{/if}
  <div class="actions"><button class="start" type="submit" disabled={disabled || duplicate || !startTeam || !endTeam}>{submitting ? "Checking teams…" : "Start"}</button></div>
</form>

<style>
  form { max-width: 1000px; margin: 32px auto 0; }
  .team-pickers { display: grid; grid-template-columns: minmax(0, 1fr) 44px minmax(0, 1fr); align-items: start; gap: 20px; }
  .swap { display: flex; align-items: center; justify-content: center; width: 44px; height: 44px; margin-top: 27px; padding: 0; border: 0; border-radius: 50%; background: transparent; color: var(--grayed-out-text-color); cursor: pointer; }
  .swap:hover:not(:disabled) { background: var(--hover-color); color: var(--text-color); }
  .swap:disabled { opacity: 0.4; cursor: default; }
  .actions { margin-top: 24px; text-align: center; }
  .start { padding: 11px 30px; border: 0; border-radius: var(--pill-border-radius); background: var(--inline-theme-color); color: #17111f; font: inherit; font-size: calc(var(--md-font-size) * 1.15); font-weight: 600; cursor: pointer; }
  .start:disabled { opacity: var(--form-disabled-opacity); cursor: default; }
  .status { color: var(--grayed-out-text-color); font-size: 13px; }
  .error { margin: 12px 0 0; color: var(--red-team-color); font-size: 13px; }
  .retry { padding: 0; border: 0; background: none; color: var(--text-color); font: inherit; text-decoration: underline; cursor: pointer; }
  @media (max-width: 600px) {
    .team-pickers { grid-template-columns: minmax(0, 1fr); gap: 12px; position: relative; }
    .swap { position: absolute; top: -8px; right: 0; margin: 0; }
  }
</style>
