<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import { writable } from "svelte/store";
  import { calcCutoff, fuzzySearch } from "@ftc-scout/common";
  import { faSearch, faXmark } from "@fortawesome/free-solid-svg-icons";
  import Fa from "svelte-fa";
  import type { TeamsSearchTeamFragment } from "$lib/graphql/generated/graphql-operations";
  import { watchForFocus } from "$lib/util/directives";
  import SearchRes from "../nav/search/SearchRes.svelte";
  import Location from "../Location.svelte";

  export let id: string;
  export let label: string;
  export let teams: TeamsSearchTeamFragment[] = [];
  export let team: TeamsSearchTeamFragment | null = null;
  export let disabled = false;
  export let loading = false;

  const dispatch = createEventDispatcher<{ change: void }>();
  const focusNum = writable(-1);
  let searchText = "";
  let previousTeam: TeamsSearchTeamFragment | null = null;

  $: if (team !== previousTeam) {
    searchText = team ? String(team.number) : "";
    previousTeam = team;
  }
  $: results = findTeams(searchText.trim().slice(0, 50), teams);

  function findTeams(needle: string, options: TeamsSearchTeamFragment[]) {
    if (needle === "") return [];
    if (/^\d+$/.test(needle)) {
      return options
        .filter((option) => String(option.number).startsWith(needle))
        .sort((a, b) => a.number - b.number)
        .slice(0, 10)
        .map((option) => ({ document: option, distance: 0, highlights: [] }));
    }
    const fuzzy = fuzzySearch(options, needle, 5, "name", true).slice(0, 10);
    const cutoff = calcCutoff(Math.min(...fuzzy.map((result) => result.distance)), needle.length);
    return fuzzy.filter((result) => result.distance <= cutoff);
  }

  function choose(option: TeamsSearchTeamFragment) {
    team = option;
    previousTeam = option;
    searchText = String(option.number);
    $focusNum = -1;
    (document.activeElement as HTMLElement | null)?.blur();
    dispatch("change");
  }

  function edit() {
    team = teams.find((option) => String(option.number) === searchText.trim()) ?? null;
    previousTeam = team;
    dispatch("change");
  }

  function clear() {
    searchText = "";
    edit();
  }

  function keydown(event: KeyboardEvent) {
    if (event.code === "ArrowDown") {
      event.preventDefault();
      $focusNum = Math.min(results.length - 1, $focusNum + 1);
    } else if (event.code === "ArrowUp") {
      event.preventDefault();
      $focusNum = Math.max(-1, $focusNum - 1);
    } else if (event.code === "Escape") {
      (event.currentTarget as HTMLElement).blur();
    } else if (event.code === "Enter" && event.target instanceof HTMLInputElement) {
      event.preventDefault();
      if (results.length) choose(results[Math.max(0, $focusNum)].document);
    }
  }
</script>

<div class="picker">
  <label for={id}>{label}</label>
  <div class="search" class:has-text={searchText !== ""} class:disabled>
    <span class="input-icon"><Fa icon={faSearch} /></span>
    <input
      {id}
      type="search"
      placeholder={loading ? "Loading teams…" : "Search for teams"}
      autocomplete="off"
      {disabled}
      bind:value={searchText}
      use:watchForFocus={{ store: focusNum, myNum: -1 }}
      on:input={edit}
      on:keydown={keydown}
    />
    <button type="button" class="input-icon" aria-label="Clear" on:mousedown|preventDefault on:click={clear}>
      <Fa icon={faXmark} />
    </button>

    <div class="results">
      {#if results.length}
        <ul>
          {#each results as res, index}
            <li>
              <SearchRes
                {res}
                {searchText}
                {focusNum}
                {index}
                on:keydown={keydown}
                on:click={(event) => {
                  event.preventDefault();
                  choose(res.document);
                }}
              />
            </li>
          {/each}
        </ul>
      {:else}
        <b>No Results</b>
      {/if}
    </div>
  </div>
  <div class="identity" aria-live="polite">
    {#if team}
      <strong>{team.name}</strong>
      <span><Location {...team.location} link={false} /></span>
    {/if}
  </div>
</div>

<style>
  .picker {
    min-width: 0;
  }

  label {
    display: block;
    margin-bottom: var(--md-gap);
    color: var(--grayed-out-text-color);
    font-size: 13px;
  }

  .search {
    display: flex;
    align-items: center;
    position: relative;
    padding: 0 var(--lg-pad);

    background: var(--fg-color);
    border: 1px solid var(--sep-color);
    border-radius: 4px;
  }

  .search.disabled {
    opacity: 0.4;
    pointer-events: none;
  }

  .search:focus-within {
    background: var(--zebra-stripe-color);
  }

  .search:focus-within.has-text {
    border-bottom-left-radius: 0;
    border-bottom-right-radius: 0;
    box-shadow: -2px 2px 10px 3px rgba(0, 0, 0, 10%);
  }

  input {
    flex: 1;
    min-width: 0;
    padding: calc(var(--navbar-size) / 6);
    padding-right: 0;
    border: none;
    border-radius: 0;
    background: none;
  }

  input:hover,
  input:active {
    background: none;
  }

  .search:focus-within input {
    outline: none;
  }

  button {
    display: none;
    border: none;
    background: none;
    color: inherit;
    font-size: inherit;
    font-family: inherit;

    padding: var(--sm-pad) var(--md-pad);
    border-radius: var(--pill-border-radius);

    cursor: pointer;
  }

  button:hover {
    background: var(--form-hover-bg-color);
  }

  button:active {
    background: var(--form-click-bg-color);
  }

  .search:focus-within button {
    display: inline;
  }

  .results {
    display: none;
    flex-direction: column;
    gap: var(--md-gap);

    position: absolute;
    top: calc(100% - 1px);
    left: -1px;
    right: -1px;
    z-index: 10;

    max-height: 350px;
    overflow-y: auto;
    padding: var(--lg-pad);

    background: var(--fg-color);
    border: 1px solid var(--sep-color);
    border-top: none;
    border-bottom-left-radius: 4px;
    border-bottom-right-radius: 4px;
    box-shadow: -2px 2px 10px 3px rgba(0, 0, 0, 10%);
  }

  .search:focus-within.has-text .results {
    display: flex;
  }

  ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  input[type="search"]::-webkit-search-decoration,
  input[type="search"]::-webkit-search-cancel-button,
  input[type="search"]::-webkit-search-results-button,
  input[type="search"]::-webkit-search-results-decoration {
    display: none;
  }

  .identity {
    min-height: 72px;
    margin-top: 16px;
  }

  .identity > strong {
    display: block;
    font-size: 24px;
    font-weight: 600;
    overflow-wrap: anywhere;
  }

  .identity > span {
    display: block;
    margin-top: 6px;
    color: var(--grayed-out-text-color);
    font-size: 13px;
  }

  @media (max-width: 600px) {
    input {
      font-size: 16px;
    }

    .identity {
      min-height: 60px;
    }

    .identity > strong {
      font-size: 22px;
    }
  }
</style>
