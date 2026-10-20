<script lang="ts">
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

<Modal {shown} titleText={searching ? "Timestamping matches" : "Match video"} {close}>
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
                    <button type="submit">Try</button>
                </form>
            {/if}
        </div>
    {/if}

    <svelte:fragment slot="footer">
        {#if toast?.readyUrl}
            <a class="footer" href={toast.readyUrl} target="_blank" rel="noreferrer">Open video</a>
        {:else if searching}
            <div class="footer-buttons">
                <button class="secondary" on:click={dismissTimestampToast}>Cancel search</button>
                <button class="primary" on:click={close}>Hide</button>
            </div>
        {:else}
            <button class="footer" on:click={close}>Close</button>
        {/if}
    </svelte:fragment>
</Modal>

<style>
    .content {
        display: flex;
        flex-direction: column;
        gap: var(--vl-gap);

        box-sizing: border-box;
        width: 460px;
        max-width: 100%;
        padding: var(--md-pad) var(--md-pad) var(--lg-pad);
    }

    .error {
        margin: 0;
        font-size: var(--md-font-size);
        line-height: 1.4;
    }

    .link {
        display: flex;
        gap: var(--lg-gap);
    }

    .link input {
        flex: 1;
        min-width: 0;
        box-sizing: border-box;
        padding: var(--md-pad);
        border: none;
        border-radius: 8px;
        background: var(--form-bg-color);
        color: var(--text-color);
        font: inherit;
        font-size: var(--md-font-size);
    }

    .link input:focus {
        outline: 2px solid var(--neutral-team-color);
    }

    .link button {
        padding: var(--md-pad) var(--lg-pad);
        border: none;
        border-radius: 8px;
        background: var(--inline-theme-color);
        color: var(--bg-color);
        font: inherit;
        font-size: var(--md-font-size);
        font-weight: 600;
        cursor: pointer;
    }

    .footer {
        display: block;
        box-sizing: border-box;
        background: var(--theme-color);
        color: var(--theme-text-color);
        font: inherit;
        font-weight: bold;
        text-align: center;
        text-decoration: none;

        border: none;
        border-radius: 0 0 8px 8px;
        padding: var(--lg-pad);
        cursor: pointer;
    }

    .footer-buttons {
        display: flex;
    }

    .footer-buttons button {
        flex: 1;
        border: none;
        padding: var(--lg-pad);
        font: inherit;
        font-weight: bold;
        cursor: pointer;
    }

    .secondary {
        background: var(--raised-bg-color);
        color: var(--text-color);
        border-radius: 0 0 0 8px;
    }

    .primary {
        background: var(--theme-color);
        color: var(--theme-text-color);
        border-radius: 0 0 8px 0;
    }
</style>
