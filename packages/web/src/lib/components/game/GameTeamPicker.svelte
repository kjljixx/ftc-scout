<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import { fuzzySearch } from "@ftc-scout/common";
  import { faSearch } from "@fortawesome/free-solid-svg-icons";
  import Fa from "svelte-fa";
  import type { TeamsSearchTeamFragment } from "$lib/graphql/generated/graphql-operations";
  import Location from "../Location.svelte";

  export let id: string;
  export let label: string;
  export let teams: TeamsSearchTeamFragment[] = [];
  export let team: TeamsSearchTeamFragment | null = null;
  export let disabled = false;

  const dispatch = createEventDispatcher<{ change: void }>();
  let searchText = "";
  let previousTeam: TeamsSearchTeamFragment | null = null;
  let shown = false;
  let activeIndex = -1;

  $: if (team !== previousTeam) {
    searchText = team ? String(team.number) : "";
    previousTeam = team;
    shown = false;
  }
  $: matches = findTeams(searchText, teams);

  function findTeams(query: string, options: TeamsSearchTeamFragment[]) {
    query = query.trim().slice(0, 50);
    if (!query) return [];
    if (/^\d+$/.test(query)) {
      return options.filter(option => String(option.number).startsWith(query))
        .sort((a, b) => a.number - b.number).slice(0, 8);
    }
    return fuzzySearch(options, query, 5, "name", true).slice(0, 8).map(result => result.document);
  }

  function choose(option: TeamsSearchTeamFragment) {
    team = option;
    previousTeam = option;
    searchText = String(option.number);
    shown = false;
    activeIndex = -1;
    dispatch("change");
  }

  function edit(value: string) {
    searchText = value;
    team = teams.find(option => String(option.number) === searchText.trim()) ?? null;
    previousTeam = team;
    shown = true;
    activeIndex = -1;
    dispatch("change");
  }

  function keydown(event: KeyboardEvent) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      shown = true;
      activeIndex = event.key === "ArrowDown"
        ? Math.min(matches.length - 1, activeIndex + 1)
        : Math.max(0, activeIndex - 1);
    } else if (event.key === "Enter" && shown && matches.length) {
      event.preventDefault();
      choose(matches[Math.max(0, activeIndex)]);
    } else if (event.key === "Escape") {
      shown = false;
      activeIndex = -1;
    }
  }
</script>

<div class="picker">
  <label for={id}>{label}</label>
  <div class="search-field">
    <Fa icon={faSearch} />
    <input
      {id} type="search" value={searchText} {disabled}
      placeholder="Team number or name" autocomplete="off" spellcheck="false"
      role="combobox" aria-autocomplete="list" aria-expanded={shown && !!searchText.trim()}
      aria-controls={`${id}-options`}
      aria-activedescendant={shown && activeIndex >= 0 ? `${id}-option-${activeIndex}` : undefined}
      on:input={(event) => edit(event.currentTarget.value)} on:keydown={keydown}
      on:focus={() => { shown = true; activeIndex = -1; }} on:blur={() => shown = false}
    />
  </div>
  {#if shown && searchText.trim() && !disabled}
    <div class="suggestions" id={`${id}-options`} role="listbox" aria-label={`${label} results`}>
      {#each matches as option, index}
        <button
          type="button" role="option" tabindex="-1" id={`${id}-option-${index}`}
          aria-selected={team?.number === option.number} class:active={index === activeIndex}
          on:pointerdown|preventDefault on:click={() => choose(option)}
        ><span>{option.number}</span><strong>{option.name}</strong></button>
      {:else}
        <div class="no-matches">No matching teams.</div>
      {/each}
    </div>
  {/if}
  <div class="identity" aria-live="polite">
    {#if team}
      <strong>{team.name}</strong>
      <span><Location {...team.location} link={false} /></span>
    {/if}
  </div>
</div>

<style>
  .picker { position: relative; min-width: 0; }
  label { display: block; margin-bottom: 10px; color: var(--grayed-out-text-color); font-size: 13px; }
  .search-field { display: flex; align-items: center; gap: 10px; height: 48px; padding: 0 12px; background: var(--fg-color); color: var(--grayed-out-text-color); border: 1px solid var(--sep-color); border-radius: 8px; }
  .search-field:focus-within { border-color: var(--inline-theme-color); }
  input { width: 100%; min-width: 0; padding: 0; border: 0; background: transparent; color: var(--text-color); font: inherit; font-size: 16px; }
  input::placeholder { color: var(--grayed-out-text-color); }
  .identity { min-height: 72px; margin-top: 16px; }
  .identity > strong { display: block; font-size: 24px; font-weight: 600; overflow-wrap: anywhere; }
  .identity > span { display: block; margin-top: 6px; color: var(--grayed-out-text-color); font-size: 13px; }
  .suggestions { position: absolute; z-index: 10; top: 76px; width: 100%; max-height: 260px; overflow: auto; padding: 4px; box-sizing: border-box; background: var(--fg-color); border: 1px solid var(--sep-color); border-radius: 8px; }
  .suggestions button { display: flex; align-items: baseline; gap: 10px; width: 100%; padding: 12px 8px; border: 0; border-radius: 4px; background: transparent; color: var(--text-color); font: inherit; text-align: left; cursor: pointer; }
  .suggestions button:hover, .suggestions button.active { background: var(--hover-color); }
  .suggestions button > span { color: var(--grayed-out-text-color); font-size: 12px; }
  .suggestions button > strong { font-size: 14px; font-weight: 600; }
  .no-matches { padding: 12px; color: var(--grayed-out-text-color); font-size: 13px; }
  @media (max-width: 600px) {
    .identity { min-height: 60px; }
    .identity > strong { font-size: 22px; }
  }
</style>
