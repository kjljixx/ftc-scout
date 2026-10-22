<script lang="ts">
    import Fa from "svelte-fa";
    import { faChevronRight, faXmark } from "@fortawesome/free-solid-svg-icons";
    import {
        dismissTimestampToast,
        setTimestampToastMinimized,
        timestampToast,
    } from "$lib/timestamps/timestampToast";
    import Button from "./Button.svelte";
    import TimestampStatus from "./TimestampStatus.svelte";
    import Toast from "./Toast.svelte";

    $: toast = $timestampToast;
    $: ready = toast?.readyUrl != null;
</script>

{#if toast?.minimized}
    <Toast
        position="top-right"
        href={toast.readyUrl}
        target={ready ? "_blank" : undefined}
        rel={ready ? "noreferrer" : undefined}
        role={ready ? undefined : "status"}
    >
        <button
            class="close"
            aria-label="Dismiss"
            on:click|preventDefault|stopPropagation={dismissTimestampToast}
        >
            <Fa icon={faXmark} />
        </button>

        {#if ready}
            <div class="open">
                <span class="name">Open {toast.description}</span>
                <span class="chevron"><Fa icon={faChevronRight} /></span>
            </div>
        {:else}
            <TimestampStatus {toast} />
            {#if toast.failure}
                <Button on:click={() => setTimestampToastMinimized(false)}>Details</Button>
            {/if}
        {/if}
    </Toast>
{/if}

<style>
    .name {
        font-size: var(--lg-font-size);
        font-weight: 600;
        line-height: 1.2;
    }

    .open {
        display: flex;
        align-items: center;
        gap: var(--md-gap);
    }

    .chevron {
        flex-shrink: 0;
        color: var(--grayed-out-text-color);
    }

    .close {
        position: absolute;
        top: var(--md-gap);
        right: var(--md-gap);

        background: none;
        border: none;
        padding: var(--sm-gap);
        cursor: pointer;
        font: inherit;
        line-height: 1;
        color: var(--grayed-out-text-color);
    }

    .close:hover {
        color: var(--text-color);
    }

</style>
