<script lang="ts">
  import { onMount } from "svelte";
  import { loadSearchData } from "$lib/graphql/search-data";
  import type { EventsSearchEventFragment, TeamsSearchTeamFragment } from "$lib/graphql/generated/graphql-operations";
  import { game } from "$lib/game/game-store";
  import { castSabotage } from "$lib/game/duel-store";
  import Modal from "../Modal.svelte";
  import GameSearchPick from "./GameSearchPick.svelte";

  export let close: () => void;

  let teams: TeamsSearchTeamFragment[] = [];
  let loading = true;
  let casting = false;
  let destroyed = false;

  $: visited = new Set($game.path.map((stop) => stop.number));
  $: unmarkable = new Set([...visited, $game.pair?.start.number, $game.pair?.destination.number]);
  $: options = teams.filter((team) => !unmarkable.has(team.number));

  onMount(() => {
    load();
    return () => (destroyed = true);
  });

  async function load() {
    try {
      const result = await loadSearchData();
      if (!destroyed) teams = result.data.teamsSearch;
    } catch (error) {
      console.error("[game] sniper search failed to load", error);
    } finally {
      if (!destroyed) loading = false;
    }
  }

  async function select(event: CustomEvent<TeamsSearchTeamFragment | EventsSearchEventFragment>) {
    const doc = event.detail;
    if (casting || doc.__typename !== "Team") return;
    casting = true;
    const cast = await castSabotage({ team: doc.number, name: doc.name });
    casting = false;
    if (cast) close();
  }
</script>

<Modal shown titleText="Sniper" {close}>
  <div class="picker">
    <GameSearchPick id="sniper-search" {options} {loading} placeholder="Search for teams" on:select={select} />
  </div>
</Modal>

<style>
  .picker {
    width: 520px;
    max-width: 100%;
    min-height: 400px;
    box-sizing: border-box;
  }
</style>
