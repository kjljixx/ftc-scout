<script lang="ts">
    import { createEventDispatcher } from "svelte";
    import Modal from "./Modal.svelte";

    export let shown = false;
    export let titleText: string;
    export let confirmText = "Delete";
    export let close: (() => void) | null = null;

    const dispatch = createEventDispatcher<{ confirm: void }>();

    function cancel() {
        if (close == null) {
            shown = false;
        } else {
            close();
        }
    }

    function confirm() {
        dispatch("confirm");
        cancel();
    }
</script>

<Modal {shown} {titleText} close={cancel}>
    <p><slot /></p>
    <div slot="footer" class="buttons">
        <button class="cancel" on:click={cancel}>Cancel</button>
        <button class="confirm" on:click={confirm}>{confirmText}</button>
    </div>
</Modal>

<style>
    p {
        margin: 0;
        max-width: 28em;
    }

    .buttons {
        display: flex;
        gap: var(--md-gap);
        justify-content: flex-end;
        padding: 0 var(--lg-pad) var(--lg-pad);
    }

    button {
        border: none;
        border-radius: 8px;
        padding: var(--md-pad) var(--lg-pad);
        font: inherit;
        font-weight: 600;
        cursor: pointer;
    }

    .cancel {
        background: var(--raised-bg-color);
        color: var(--text-color);
    }

    .confirm {
        background: var(--red-team-color);
        color: white;
    }
</style>
