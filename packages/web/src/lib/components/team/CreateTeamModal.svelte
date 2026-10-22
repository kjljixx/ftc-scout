<script lang="ts">
    import { invalidateAll } from "$app/navigation";
    import ConfirmModal from "../ConfirmModal.svelte";
    import Modal from "../Modal.svelte";
    import Searchbar from "../nav/search/Searchbar.svelte";
    import TeamName from "./TeamName.svelte";
    import TeamShare from "./TeamShare.svelte";
    import { createTeam } from "$lib/team/team-actions";
    import { teamModal, type JoinedTeam } from "$lib/team/team-store";
    import type { TeamsSearchTeamFragment } from "$lib/graphql/generated/graphql-operations";

    let picked: TeamsSearchTeamFragment | null = null;
    let created: JoinedTeam | null = null;
    let creating = false;
    let error = "";

    $: shown = $teamModal == "create";
    $: if (!shown) {
        picked = null;
        created = null;
        error = "";
    }

    function close() {
        $teamModal = null;
    }

    async function create() {
        if (!picked || creating) return;
        creating = true;
        error = "";
        try {
            created = await createTeam(picked.number);
            await invalidateAll();
        } catch (e) {
            console.error("[team] create failed", e);
            error = e instanceof Error ? e.message : "Could not create the team";
        } finally {
            creating = false;
        }
    }
</script>

{#if created}
    <Modal {shown} {close} closeText="Done">
        <TeamName slot="title" name={created.name} number={created.teamNumber} />
        <TeamShare token={created.token} />
    </Modal>
{:else}
    <ConfirmModal
        {shown}
        {close}
        titleText="Create a team"
        width="md"
        confirmText="Create team"
        variant="primary"
        confirmDisabled={!picked || creating}
        closeOnConfirm={false}
        overflowVisible
        on:confirm={create}
    >
        <div>
            <Searchbar pickTeam={(t) => (picked = t)} inputId="team-picker" />
            {#if error}<p class="error">{error}</p>{/if}
        </div>
    </ConfirmModal>
{/if}

<style>
    .error {
        margin-top: var(--md-gap);
        color: var(--red-team-text-color);
    }
</style>
