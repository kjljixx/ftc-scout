<script lang="ts">
    import { goto } from "$app/navigation";
    import Card from "$lib/components/Card.svelte";
    import Head from "$lib/components/Head.svelte";
    import WidthProvider from "$lib/components/WidthProvider.svelte";
    import TeamName from "$lib/components/team/TeamName.svelte";
    import { adoptTeam } from "$lib/team/team-actions";

    export let data;

    async function join() {
        adoptTeam({ token: data.token, teamNumber: data.teamNumber, name: data.name });
        await goto("/", { invalidateAll: true });
    }
</script>

<Head title="Join {data.name} | 2iLScout" />

<WidthProvider width="800px">
    <Card vis={false}>
        <div class="inner">
            <p class="invited">You've been invited to join</p>
            <h1><TeamName name={data.name} number={data.teamNumber} numberSize="0.625em" /></h1>
            <div class="buttons">
                <button class="join" on:click={join}>Join</button>
                <button class="decline" on:click={() => goto("/")}>No thanks</button>
            </div>
        </div>
    </Card>
</WidthProvider>

<style>
    .inner {
        display: flex;
        justify-content: center;
        align-items: center;
        flex-direction: column;
        gap: var(--md-gap);
        margin-top: 10vh;
    }

    .invited {
        font-size: var(--lg-font-size);
        color: var(--secondary-text-color);
        text-align: center;
    }

    h1 {
        font-weight: 600;
        font-size: calc(var(--xl-font-size) * 2);
        max-width: 100%;
        margin-bottom: var(--vl-gap);
    }

    .buttons {
        display: flex;
        gap: var(--md-gap);
    }

    button {
        border: none;
        border-radius: 8px;
        padding: var(--md-pad) var(--lg-pad);
        font: inherit;
        font-weight: 600;
        cursor: pointer;
    }

    .join {
        background: var(--theme-color);
        color: var(--theme-text-color);
    }

    .decline {
        background: var(--raised-bg-color);
        color: var(--text-color);
    }
</style>
