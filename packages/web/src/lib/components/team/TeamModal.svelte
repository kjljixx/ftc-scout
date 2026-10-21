<script lang="ts">
    import Modal from "../Modal.svelte";
    import TeamName from "./TeamName.svelte";
    import TeamShare from "./TeamShare.svelte";
    import { leaveTeam } from "$lib/team/team-actions";
    import { team, teamModal } from "$lib/team/team-store";

    function close() {
        $teamModal = null;
    }

    function leave() {
        leaveTeam();
        close();
    }
</script>

<Modal shown={$teamModal == "team" && !!$team} {close}>
    <svelte:fragment slot="title">
        {#if $team}<TeamName name={$team.name} number={$team.teamNumber} />{/if}
    </svelte:fragment>
    {#if $team}<TeamShare token={$team.token} />{/if}

    <div slot="footer" class="buttons">
        <button class="leave" on:click={leave}>Leave team</button>
        <button class="done" on:click={close}>Close</button>
    </div>
</Modal>

<style>
    .buttons {
        display: flex;
        gap: var(--md-gap);
        justify-content: flex-end;
        padding: var(--lg-pad);
    }

    button {
        border: none;
        border-radius: 8px;
        padding: var(--md-pad) var(--lg-pad);
        font: inherit;
        font-weight: 600;
        cursor: pointer;
    }

    .leave {
        background: var(--red-team-color);
        color: white;
    }

    .done {
        background: var(--theme-color);
        color: var(--theme-text-color);
    }
</style>
