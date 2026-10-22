<script lang="ts">
    import { createEventDispatcher } from "svelte";
    import Button from "./Button.svelte";
    import Modal from "./Modal.svelte";

    export let shown = false;
    export let titleText: string;
    export let confirmText = "Delete";
    export let variant: "danger" | "primary" = "danger";
    export let confirmDisabled = false;
    export let overflowVisible = false;
    export let closeOnConfirm = true;
    export let close: (() => void) | null = null;
    export let width: "sm" | "md" | "lg" | null = null;

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

<Modal {shown} {titleText} {overflowVisible} {width} close={cancel}>
    <div class="body"><slot /></div>
    <svelte:fragment slot="footer">
        <Button variant="secondary" on:click={cancel}>Cancel</Button>
        <Button {variant} disabled={confirmDisabled} on:click={confirm}>{confirmText}</Button>
    </svelte:fragment>
</Modal>

<style>
    .body {
        max-width: 28em;
    }
</style>
