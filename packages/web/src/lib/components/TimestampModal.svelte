<script lang="ts">
    import Button from "./Button.svelte";
    import Modal from "./Modal.svelte";
    import TimestampStatus from "./TimestampStatus.svelte";
    import {
        dismissTimestampToast,
        setTimestampToastMinimized,
        submitLivestreamLink,
        timestampToast,
    } from "$lib/timestamps/timestampToast";

    let link = "";

    $: toast = $timestampToast;
    $: shown = toast != null && !toast.minimized;
    $: searching = toast != null && !toast.readyUrl && !toast.failure;
    $: if (!toast?.failure) link = "";

    function close() {
        if (searching) setTimestampToastMinimized(true);
        else dismissTimestampToast();
    }
</script>

<Modal
    {shown}
    titleText={searching ? "Timestamping matches" : "Match video"}
    width="md"
    {close}
>
    {#if toast}
        <div class="content">
            <TimestampStatus {toast} />
            {#if toast.failure}
                <p class="error">{toast.failure}</p>
                <form class="link" on:submit|preventDefault={() => submitLivestreamLink(link)}>
                    <input
                        type="text"
                        bind:value={link}
                        placeholder="Paste a YouTube livestream link"
                        aria-label="YouTube livestream link"
                    />
                    <Button type="submit">Try</Button>
                </form>
            {/if}
        </div>
    {/if}

    <svelte:fragment slot="footer">
        {#if toast?.readyUrl}
            <Button variant="secondary" on:click={close}>Close</Button>
            <Button href={toast.readyUrl} target="_blank" rel="noreferrer">Open video</Button>
        {:else if searching}
            <Button variant="secondary" on:click={dismissTimestampToast}>Cancel search</Button>
            <Button on:click={close}>Hide</Button>
        {:else}
            <Button variant="secondary" on:click={close}>Close</Button>
        {/if}
    </svelte:fragment>
</Modal>

<style>
    .content {
        display: flex;
        flex-direction: column;
        gap: var(--vl-gap);

        padding: var(--md-pad) var(--md-pad) var(--lg-pad);
    }

    .error {
        margin: 0;
        font-size: var(--md-font-size);
        line-height: 1.4;
    }

    .link {
        display: flex;
        gap: var(--md-gap);
    }

    .link input {
        flex: 1;
        min-width: 0;
    }
</style>
