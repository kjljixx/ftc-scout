<script lang="ts">
    import Button from "../Button.svelte";
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

    <svelte:fragment slot="footer">
        <Button variant="danger" on:click={leave}>Leave team</Button>
        <Button on:click={close}>Close</Button>
    </svelte:fragment>
</Modal>
