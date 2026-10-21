<script lang="ts">
    import { createEventDispatcher } from "svelte";
    import Modal from "./Modal.svelte";

    export let shown = false;
    export let titleText: string;
    export let confirmText = "Delete";
    export let variant: "danger" | "primary" = "danger";
    export let confirmDisabled = false;
    export let overflowVisible = false;
    export let closeOnConfirm = true;
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
        if (closeOnConfirm) cancel();
    }
</script>

<Modal {shown} {titleText} {overflowVisible} close={cancel}>
    <div class="body"><slot /></div>
    <div slot="footer" class="buttons">
        <button class="cancel" on:click={cancel}>Cancel</button>
        <button class="confirm {variant}" disabled={confirmDisabled} on:click={confirm}>
            {confirmText}
        </button>
    </div>
</Modal>

<style>
    .body {
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

    button:disabled {
        opacity: var(--form-disabled-opacity);
        cursor: default;
    }

    .cancel {
        background: var(--raised-bg-color);
        color: var(--text-color);
    }

    .confirm.danger {
        background: var(--red-team-color);
        color: white;
    }

    .confirm.primary {
        background: var(--theme-color);
        color: var(--theme-text-color);
    }
</style>
