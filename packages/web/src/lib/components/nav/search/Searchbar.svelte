<script lang="ts">
    import { faSearch, faXmark } from "@fortawesome/free-solid-svg-icons";
    import Fa from "svelte-fa";
    import type {
        CombinedSearchQuery,
        TeamsSearchTeamFragment,
        EventsSearchEventFragment,
    } from "../../../graphql/generated/graphql-operations";
    import { fuzzySearch, type FuzzyResult, calcCutoff } from "@ftc-scout/common";
    import { loadSearchData } from "../../../graphql/search-data";
    import { globalSeason } from "$lib/season-store";
    import type { Season } from "@ftc-scout/common";
    import { browser } from "$app/environment";
    import { writable } from "svelte/store";
    import type { ApolloQueryResult } from "@apollo/client";
    import SearchRes from "./SearchRes.svelte";
    import { isCompetition } from "../../../util/event-type";
    import SkeletonRow from "../../skeleton/SkeletonRow.svelte";
    import { afterNavigate, goto, preloadData } from "$app/navigation";
    import { focusWithinOut, watchForFocus } from "../../../util/directives";
    import { onMount } from "svelte";

    export let disabled = false;
    export let pickTeam: ((team: TeamsSearchTeamFragment | null) => void) | null = null;
    export let inputId = "searchbar";

    let searchText = "";
    let shown = false;
    let picked = false;

    let loadingSeason: Season | null = null;
    const results = writable<ApolloQueryResult<CombinedSearchQuery> | null>(null);

    function loadData() {
        if (!browser || loadingSeason == $globalSeason) return;

        let season = $globalSeason;
        loadingSeason = season;
        loadSearchData(season)
            .then((res) => {
                if (season == $globalSeason) results.set(res);
            })
            .catch(() => {
                if (loadingSeason == season) loadingSeason = null;
            });
    }

    $: if (loadingSeason != null && loadingSeason != $globalSeason) {
        console.debug(`[searchbar] season changed to ${$globalSeason}, reloading search data`);
        results.set(null);
        loadData();
    }

    function prefetch(reason: string) {
        if (!browser || loadingSeason == $globalSeason) return;
        console.debug(`[searchbar] prefetching search data (${reason})`);
        loadData();
    }

    function prefetchWhenIdle() {
        if ((navigator as any).connection?.saveData) {
            console.debug("[searchbar] idle prefetch skipped (data saver on)");
            return;
        }
        if ("requestIdleCallback" in window) {
            requestIdleCallback(() => prefetch("idle"), { timeout: 2000 });
        } else {
            setTimeout(() => prefetch("idle"), 1500);
        }
    }

    onMount(prefetchWhenIdle);

    function getURL(res:FuzzyResult<EventsSearchEventFragment | TeamsSearchTeamFragment>): string {
        let r = res.document;
        if (r.__typename == "Event") {
            return `/events/${r.season}/${r.code}/matches`;
        } else {
            return `/teams/${r.number}`;
        }
    }

    function preload() {
        if (pickTeam || searchResults.length == 0) return;
        let r = searchResults[Math.max(0, $focusNum)];
        preloadData(getURL(r));
    }

    function pick(res: FuzzyResult<EventsSearchEventFragment | TeamsSearchTeamFragment>) {
        let doc = res.document;
        if (!pickTeam || doc.__typename != "Team") return;
        picked = true;
        searchText = `${doc.name} ${doc.number}`;
        pickTeam(doc);
    }

    function onResultClick(
        e: MouseEvent,
        res: FuzzyResult<EventsSearchEventFragment | TeamsSearchTeamFragment>
    ) {
        if (!pickTeam) {
            searchText = "";
            return;
        }
        e.preventDefault();
        pick(res);
    }

    function onInput() {
        if (!picked) return;
        picked = false;
        pickTeam?.(null);
    }

    function submit() {
        if (searchResults.length == 0) return;
        if (pickTeam) return pick(searchResults[0]);
        goto(getURL(searchResults[0]));
        searchText = "";
    }

    let focusNum = writable(-1);

    function key(e: KeyboardEvent) {
        if (e.code == "ArrowDown") {
            e.preventDefault();
            $focusNum = Math.min(searchResults.length - 1, $focusNum + 1);
        } else if (e.code == "ArrowUp") {
            e.preventDefault();
            $focusNum = Math.max(-1, $focusNum - 1);
        } else if (e.code == "Escape") {
            document.getElementById(inputId)?.blur();
        }
    }

    function show() {
        shown = true;
        setTimeout(() => document.getElementById(inputId)?.focus(), 5);
    }

    function docKey(e: KeyboardEvent) {
        if (disabled || pickTeam || e.key !== "/" || e.ctrlKey || e.metaKey) return;
        let tagname = e?.target && "tagName" in e?.target ? e.target.tagName + "" : "";
        if (/^(?:input|textarea|select|button)$/i.test(tagname)) return;

        e.preventDefault();
        shown = true;
        document.getElementById(inputId)?.focus();
    }

    $: relevantEvents = pickTeam
        ? []
        : ($results?.data?.eventsSearch ?? []).filter((e) => isCompetition(e.type));
    $: relevantTeams = $results?.data?.teamsSearch ?? [];

    $: browser && searchText != "" && loadData();

    function search(needle: string, es: typeof relevantEvents, ts: typeof relevantTeams) {
        if (needle == "") return [];
        if (needle.match(/^\d+$/)) {
            return ts
                .filter((t) => (t.number + "").startsWith(needle))
                .sort((a, b) => a.number - b.number)
                .slice(0, 10)
                .map((t) => ({ document: t, distance: 0, highlights: [] }));
        }

        let events = fuzzySearch(es, needle, 5, "name", true).slice(0, 10);
        let eventCodeMatches = es.filter(
            (e) =>
                needle.length >= 4 && e.code.toLowerCase().startsWith(needle.toLowerCase().trim())
        );
        eventCodeMatches.forEach((e) => {
            events.push({ document: e, distance: e.code.length - needle.length, highlights: [] });
        });

        let teams = fuzzySearch(ts, needle, 5, "name", true).slice(0, 10);

        let bestEvent = Math.min(...events.map((e) => e.distance));
        let bestTeam = Math.min(...teams.map((t) => t.distance));
        let cutoff = calcCutoff(Math.min(bestEvent, bestTeam), needle.length);

        let filteredEvents = events.filter((e) => e.distance <= cutoff);
        let filteredTeams = teams.filter((t) => t.distance <= cutoff);

        return bestTeam <= bestEvent
            ? [...filteredTeams, ...filteredEvents]
            : [...filteredEvents, ...filteredTeams];
    }

    $: searchResults = search(searchText.trim().slice(0, 50), relevantEvents, relevantTeams);

    $: searchResults, $focusNum, preload();

    $: showResults = searchText != "" && !picked;

    afterNavigate(() => (searchText = ""));
</script>

<svelte:document on:keydown={docKey} />

<form
    on:submit|preventDefault={submit}
    on:pointerenter={() => prefetch("pointer")}
    on:touchstart|passive={() => prefetch("touch")}
    use:focusWithinOut={() => setTimeout(() => (shown = false), 50)}
    class:has-text={showResults}
    class:shown={shown || !!pickTeam}
    class:pick={!!pickTeam}
    class:disabled
>
    <span class="input-icon"><Fa icon={faSearch} /></span>
    <input
        bind:value={searchText}
        on:focusin={loadData}
        on:keydown={key}
        on:input={onInput}
        use:watchForFocus={{ store: focusNum, myNum: -1 }}
        id={inputId}
        placeholder={pickTeam ? "Search for a team" : "Search for teams and events"}
        type="search"
        autocomplete="off"
        {disabled}
    />

    <!-- Submit the form on enter -->
    <input type="submit" style="display: none" />

    <span class="shortcut">/</span>
    <button on:click|preventDefault|stopPropagation={() => (searchText = "")} class="input-icon">
        <Fa icon={faXmark} />
    </button>

    <div class="results">
        {#if showResults && $results == null}
            <SkeletonRow rows={7} card={false} header={false} />
        {:else if searchResults.length && showResults}
            <ul>
                {#each searchResults as res, index}
                    <li>
                        <SearchRes
                            {res}
                            {searchText}
                            {focusNum}
                            {index}
                            on:keydown={key}
                            on:click={(e) => onResultClick(e, res)}
                        />
                    </li>
                {/each}
            </ul>
        {:else if showResults}
            <b>No Results</b>
        {/if}
    </div>
</form>

{#if !pickTeam}
    <button
        class="search-btn"
        on:click={show}
        on:pointerenter={() => prefetch("pointer")}
        on:touchstart|passive={() => prefetch("touch")}
    >
        <Fa icon={faSearch} size="1.5x" />
    </button>
{/if}

<style>
    form {
        display: flex;
        align-items: center;
        padding: 0 var(--lg-pad);

        background: var(--fg-color);

        transition: width 0.3s ease 0s;

        border: 1px solid var(--sep-color);
        outline-offset: -1px;
        border-radius: 4px;

        position: relative;
    }

    form.disabled {
        opacity: 0.4;
        pointer-events: none;
    }

    form:focus-within {
        background: var(--zebra-stripe-color);
    }

    form:focus-within.has-text {
        border-bottom-left-radius: 0;
        border-bottom-right-radius: 0;
        box-shadow: -2px 2px 10px 3px rgba(0, 0, 0, 10%);
    }

    input {
        width: 260px;
        --expanded-width: 600px;
        transition: width 300ms 0s cubic-bezier(0.4, 0, 0.2, 1);

        border-radius: 4px;
        padding: calc(var(--navbar-size) / 6);
        padding-right: 0;
        border: none;
        border-radius: 0;
        background: none;
    }

    form:focus-within input {
        outline: none;
        width: var(--expanded-width);
    }

    form button {
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

    form button:hover {
        background: var(--form-hover-bg-color);
    }

    form button:active {
        background: var(--form-click-bg-color);
    }

    .results {
        display: flex;
        flex-direction: column;
        gap: var(--md-gap);

        position: absolute;
        top: calc(100% - 2px);
        left: -1px;
        right: -1px;

        max-height: 0px;
        padding: 0 var(--lg-pad);
        overflow-y: hidden;
        transition-property: max-height, padding-top, padding-bottom, overflow-y, clip-path,
            border-color;
        transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
        transition-duration: 0.3s;

        background: var(--fg-color);

        border: 1px solid var(--sep-color);
        border-top: none;
        border-bottom-left-radius: 4px;
        border-bottom-right-radius: 4px;
        z-index: 1;

        box-shadow: -2px 2px 10px 3px rgba(0, 0, 0, 10%);

        /* Hide border */
        clip-path: inset(1px 1px 1px 1px);
    }

    ul {
        list-style: none;
    }

    @keyframes add-scroll {
        from {
            overflow-y: hidden;
        }
        to {
            overflow-y: auto;
        }
    }

    form.has-text:focus-within .results {
        max-height: 350px;
        padding: var(--lg-pad);

        clip-path: inset(0px -10px -10px -10px);

        animation: add-scroll 0.6s;
        overflow-y: auto;
    }

    @keyframes fade-in {
        from {
            opacity: 0;
        }
        to {
            opacity: 1;
        }
    }

    form:focus-within button {
        opacity: 1;
        display: inline;
        animation: fade-in 0.3s;
    }

    .shortcut {
        color: gray;
        outline: 1px solid gray;
        border-radius: 4px;
        padding: 1px var(--sm-pad);
    }

    form:focus-within .shortcut {
        display: none;
    }

    input[type="search"]::-webkit-search-decoration,
    input[type="search"]::-webkit-search-cancel-button,
    input[type="search"]::-webkit-search-results-button,
    input[type="search"]::-webkit-search-results-decoration {
        display: none;
    }

    @media (max-width: 960px) {
        input {
            --expanded-width: 500px;
        }
    }

    .search-btn {
        display: none;

        background: none;
        border: none;
        font-family: inherit;
        color: var(--theme-text-color);
        cursor: pointer;

        margin-right: var(--sm-gap);
    }

    form.pick,
    form.pick:not(.shown) {
        display: flex;
        position: relative;
        left: auto;
        right: auto;
        width: 100%;
    }

    form.pick input,
    form.pick:focus-within input {
        width: 100%;
        flex: 1;
        min-width: 0;
        --expanded-width: 100%;
    }

    @media (max-width: 860px) {
        form {
            position: absolute;
            left: var(--md-gap);
            right: var(--md-gap);
        }

        .input-icon {
            font-size: var(--lg-font-size);
        }

        input {
            /* --expanded-width: calc(100% - 60px); */
            /* width: var(--expanded-width); */
            transition-property: none;

            font-size: 16px;
        }

        form:not(.shown) {
            display: none;
        }

        .search-btn {
            display: block;
        }
    }
</style>
