<script lang="ts">
    import { DESCRIPTORS_LIST, type Season } from "@ftc-scout/common";
    import Select from "./Select.svelte";

    export let season: Season | "overall";
    export let nonForm = false;
    export let id: string | null = null;
    export let disabledValues: Season[] = [];
    export let includeOverall = false;

    const i = (x: Season | "overall") => (seasonStr = "" + x);
    const o = (x: string) => (season = x == "overall" ? x : (+x as Season));

    let seasonStr: string;

    $: i(season);
    $: o(seasonStr);

    $: seasonOptions = DESCRIPTORS_LIST.slice()
        .reverse()
        .map((d) => ({
            value: d.season + "",
            name: d.seasonNameWithYear,
        }));
</script>

<Select
    bind:value={seasonStr}
    name={"season"}
    disabledValues={disabledValues.map((d) => d + "")}
    options={includeOverall
        ? [{ value: "overall", name: "Overall" }, ...seasonOptions]
        : seasonOptions}
    {nonForm}
    {id}
    on:change
/>
