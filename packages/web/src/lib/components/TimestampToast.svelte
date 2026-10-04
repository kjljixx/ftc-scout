<script lang="ts">
    import Fa from "svelte-fa";
    import { faChevronRight, faXmark } from "@fortawesome/free-solid-svg-icons";
    import { fly } from "svelte/transition";
    import {
        dismissTimestampToast,
        submitLivestreamLink,
        timestampToast,
    } from "$lib/timestamps/timestampToast";

    let link = "";

    $: toast = $timestampToast;
    $: ready = toast?.readyUrl != null;
</script>

{#if toast}
    <svelte:element
        this={ready ? "a" : "div"}
        class="toast"
        href={toast.readyUrl}
        target={ready ? "_blank" : undefined}
        rel={ready ? "noreferrer" : undefined}
        role={ready ? undefined : "status"}
        transition:fly={{ x: 100, duration: 300 }}
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
        {:else if toast.failure}
            <div class="team">
                <span class="name">{toast.description}</span>
                <span class="detail">Couldn't find it</span>
            </div>
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
        {:else}
            <div class="team">
                <span class="name">{toast.description}</span>
                <span class="detail">Finding the match</span>
            </div>
            <div class="bar"><div class="fill" style="width: {toast.progress * 100}%" /></div>
            <div class="stat">
                <span class="label">Video</span>
                <span class="value">{toast.videoNumber} of {toast.videoCount}</span>
            </div>
        {/if}
    </svelte:element>
{/if}

<style>
    .toast {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: var(--md-gap) var(--vl-gap);
        text-decoration: none;

        position: fixed;
        top: calc(var(--navbar-size) + var(--md-gap));
        right: var(--md-gap);
        width: min(340px, calc(100% - var(--md-gap) * 2));
        box-sizing: border-box;

        background: var(--raised-bg-color);
        color: var(--text-color);

        padding: var(--lg-pad) calc(var(--vl-gap) + var(--md-font-size)) var(--lg-pad)
            var(--vl-gap);
        border-radius: 12px;
        box-shadow: inset 0 0 0 2px var(--focused-team-ring-color), 0 16px 32px rgba(0, 0, 0, 0.45),
            0 2px 6px rgba(0, 0, 0, 0.4);

        z-index: var(--focused-team-zi);
    }

    .team {
        display: flex;
        align-items: baseline;
        gap: var(--md-gap);

        flex: 1;
        min-width: 0;
    }

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

    .detail {
        font-size: var(--md-font-size);
        color: var(--grayed-out-text-color);

        white-space: nowrap;
        text-overflow: ellipsis;
        overflow: hidden;
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

    .error {
        flex-basis: 100%;
        margin: 0;
        font-size: var(--md-font-size);
        line-height: 1.3;
    }

    .link {
        display: flex;
        flex-basis: 100%;
        gap: var(--md-gap);
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

    .bar {
        flex-basis: 100%;
        height: 6px;
        border-radius: 3px;
        overflow: hidden;
        background: var(--neutral-team-bg-color);
    }

    .fill {
        height: 100%;
        border-radius: 3px;
        background: var(--neutral-team-color);
        transition: width 0.4s ease;
    }

    .stat {
        display: flex;
        flex-direction: column;
        gap: 2px;
        flex: 1;
    }

    .label {
        font-size: var(--sm-font-size);
        color: var(--grayed-out-text-color);
    }

    .value {
        font-size: var(--lg-font-size);
        font-weight: 600;
        line-height: 1.2;
        font-variant-numeric: tabular-nums;
    }

    @media (max-width: 600px) {
        .toast {
            padding: var(--lg-pad) calc(var(--lg-pad) + var(--md-font-size)) var(--lg-pad)
                var(--lg-pad);
        }

        .detail,
        .label {
            font-size: var(--md-font-size);
        }
    }
</style>
