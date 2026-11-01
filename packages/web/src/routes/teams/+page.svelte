<script lang="ts">
    import Card from "../../lib/components/Card.svelte";
    import WidthProvider from "../../lib/components/WidthProvider.svelte";
    import Form from "../../lib/components/ui/form/Form.svelte";
    import SearchInput from "../../lib/components/ui/form/SearchInput.svelte";
    import { REGION_EC_DC } from "../../lib/util/search-params/region";
    import { queryParam } from "../../lib/util/search-params/search-params";
    import { STRING_EC_DC } from "../../lib/util/search-params/string";
    import RegionSelect from "../../lib/components/ui/form/RegionSelect.svelte";
    import Loading from "../../lib/components/Loading.svelte";
    import SkulletReveal from "../../lib/components/skeleton/SkulletReveal.svelte";
    import TeamsList from "./TeamsList.svelte";
    import { SAMPLE_TEAM_ROWS } from "./sampleTeamRows";
    import { fuzzySearch } from "@ftc-scout/common";
    import InfiniteScroll from "svelte-infinite-scroll";
    import { browser } from "$app/environment";
    import Head from "$lib/components/Head.svelte";

    export let data;
    $: teamsStore = data.teams;
    $: teams = $teamsStore?.data.teamsSearch ?? [];

    let searchText = queryParam("search", STRING_EC_DC);
    let region = queryParam("regions", REGION_EC_DC);

    let elementScroll = (browser ? document.getElementById("content") : null)!;
    let take = 100;
    $: {
        $searchText;
        $region;
        take = 100;
    }

    function doSearch(needle: string, ts: typeof teams) {
        if (needle.match(/^\d+$/)) {
            return ts
                .filter((t) => (t.number + "").startsWith(needle))
                .sort((a, b) => a.number - b.number)
                .map((t) => ({ document: t, distance: 0, highlights: [] }));
        }

        return fuzzySearch(teams, $searchText, Infinity, "name", true);
    }

    $: search = doSearch($searchText, teams);
</script>

<Head title="Teams | 2iLScout" description="Find and search for FTC teams." />

<WidthProvider>
    <Card>
        <h1>Teams</h1>

        <Form id="team-search" style="col">
            <div class="row">
                <label for="search-select">
                    Search
                    <SearchInput bind:value={$searchText} name="search" id="search-select" />
                </label>

                <label for="region-select">
                    Regions
                    <RegionSelect bind:region={$region} name="regions" id="region-select" />
                </label>
            </div>

            <noscript> <input type="submit" /> </noscript>
        </Form>
    </Card>

    <Loading store={$teamsStore} checkExists={() => true}>
        <SkulletReveal slot="loading" label="Loading teams">
            <TeamsList rows={SAMPLE_TEAM_ROWS} />
        </SkulletReveal>

        <TeamsList rows={search.slice(0, take)} searchText={$searchText}>
            <InfiniteScroll threshold={200} on:loadMore={() => (take += 100)} {elementScroll} />
        </TeamsList>
    </Loading>
</WidthProvider>

<style>
    h1 {
        margin-top: var(--sm-gap);
        margin-bottom: var(--lg-gap);
    }

    label,
    div {
        display: flex;
        flex-direction: column;
        gap: var(--sm-gap);
        width: 100%;
    }

    .row {
        display: flex;
        flex-direction: row;
        gap: var(--vl-gap);
    }

    @media (max-width: 800px) {
        .row {
            flex-direction: column;
            gap: var(--md-gap);
        }
    }

    noscript {
        display: flex;
        justify-content: right;
        margin-top: var(--md-gap);
    }
</style>
