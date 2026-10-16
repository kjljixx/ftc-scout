<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import { writable } from "svelte/store";
  import { calcCutoff, fuzzySearch, type FuzzyResult } from "@ftc-scout/common";
  import { faSearch, faXmark } from "@fortawesome/free-solid-svg-icons";
  import Fa from "svelte-fa";
  import type { EventsSearchEventFragment, TeamsSearchTeamFragment } from "$lib/graphql/generated/graphql-operations";
  import { watchForFocus } from "$lib/util/directives";
  import SearchRes from "../nav/search/SearchRes.svelte";

  type Doc = TeamsSearchTeamFragment | EventsSearchEventFragment;

  export let id: string;
  export let options: Doc[] = [];
  export let placeholder: string;
  export let loading = false;

  const dispatch = createEventDispatcher<{ select: Doc }>();
  const focusNum = writable(-1);
  let searchText = "";

  $: results = find(searchText.trim().slice(0, 50), options);

  function find(needle: string, docs: Doc[]): FuzzyResult<Doc>[] {
    if (needle === "") return [];
    if (/^\d+$/.test(needle)) {
      return (docs.filter((doc) => doc.__typename === "Team" && String(doc.number).startsWith(needle)) as TeamsSearchTeamFragment[])
        .sort((a, b) => a.number - b.number)
        .slice(0, 10)
        .map((doc) => ({ document: doc, distance: 0, highlights: [] }));
    }
    const fuzzy = fuzzySearch(docs, needle, 5, "name", true).slice(0, 10);
    const cutoff = calcCutoff(Math.min(...fuzzy.map((result) => result.distance)), needle.length);
    return fuzzy.filter((result) => result.distance <= cutoff);
  }

  function choose(doc: Doc) {
    console.info(`[game] sabotage search picked ${doc.__typename} ${doc.__typename === "Team" ? doc.number : `${doc.season}/${doc.code}`}`);
    dispatch("select", doc);
  }

  function keydown(event: KeyboardEvent) {
    if (event.code === "ArrowDown") {
      event.preventDefault();
      $focusNum = Math.min(results.length - 1, $focusNum + 1);
    } else if (event.code === "ArrowUp") {
      event.preventDefault();
      $focusNum = Math.max(-1, $focusNum - 1);
    } else if (event.code === "Enter" && event.target instanceof HTMLInputElement) {
      event.preventDefault();
      if (results.length) choose(results[Math.max(0, $focusNum)].document);
    }
  }
</script>

<div class="search" class:has-text={searchText !== ""}>
  <span class="input-icon"><Fa icon={faSearch} /></span>
  <input
    {id}
    type="search"
    placeholder={loading ? "Loading…" : placeholder}
    autocomplete="off"
    disabled={loading}
    bind:value={searchText}
    use:watchForFocus={{ store: focusNum, myNum: -1 }}
    on:keydown={keydown}
  />
  <button type="button" class="input-icon" aria-label="Clear" on:mousedown|preventDefault on:click={() => (searchText = "")}>
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

<style>
  .search {
    display: flex;
    align-items: center;
    position: relative;
    padding: 0 var(--lg-pad);

    background: var(--fg-color);
    border: 1px solid var(--sep-color);
    border-radius: 4px;
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

  @media (max-width: 600px) {
    input {
      font-size: 16px;
    }
  }
</style>
