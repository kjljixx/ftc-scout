<script lang="ts">
    import Card from "../../Card.svelte";
    import SampleHomeEvents from "./SampleHomeEvents.svelte";
    import SampleWorldRecord from "./SampleWorldRecord.svelte";
</script>

<Card vis={false}>
    <div class="title">
        <h1>2iLScout</h1>
        <p>A new way to track and scout FIRST Tech Challenge</p>
    </div>
    <div class="infos">
        <div class="info-box">
            <div class="icon" />
            <b>5,421</b>
            <p>Active Teams</p>
        </div>
        <div class="info-box">
            <div class="icon" />
            <b>112,308</b>
            <p>Matches Played</p>
        </div>
    </div>
    <div class="box">
        <h2>Today's Events</h2>
        <SampleHomeEvents />
    </div>
    <div class="box">
        <h2>World Record</h2>
        <SampleWorldRecord />
    </div>
</Card>

<style>
    .title {
        display: flex;
        flex-direction: column;
        align-items: center;
        margin-bottom: var(--xl-gap);
    }

    .title h1 {
        font-weight: 600;
        font-size: calc(var(--xl-font-size) * 1.5);
        margin: var(--md-gap);
    }

    .title p {
        margin: 0;
        font-size: var(--vl-font-size);
        text-align: center;
    }

    .infos {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: var(--lg-gap);
        margin-bottom: var(--vl-gap);
    }

    .info-box {
        display: grid;
        grid-template-columns: min-content auto;
        grid-template-rows: auto auto;
        gap: var(--sm-gap) var(--lg-gap);
        background: var(--fg-color);
        border-radius: 8px;
        border: 1px solid var(--sep-color);
        padding: var(--lg-pad);
        font-size: var(--lg-font-size);
    }

    .icon {
        background: var(--theme-color);
        border-radius: var(--pill-border-radius);
        grid-row: span 2;
        width: calc(var(--lg-font-size) * 3);
        height: calc(var(--lg-font-size) * 3);
    }

    .info-box b {
        display: flex;
        align-items: end;
    }

    .info-box p {
        margin: 0;
    }

    .box {
        padding: var(--lg-pad);
        border-radius: 8px;
        border: 1px solid var(--sep-color);
        background: var(--fg-color);
        margin-bottom: var(--vl-gap);
    }

    h2 {
        margin-top: var(--sm-gap);
        margin-bottom: var(--lg-gap);
    }
</style>
