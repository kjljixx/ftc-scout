<script lang="ts">
    import type { TimestampToast } from "$lib/timestamps/timestampToast";

    export let toast: TimestampToast;

    $: detail = toast.readyUrl ? "Found it" : toast.failure ? "Couldn't find it" : "Finding the match";
</script>

<div class="team">
    <span class="name">{toast.description}</span>
    <span class="detail">{detail}</span>
</div>
{#if !toast.readyUrl && !toast.failure}
    <div class="bar"><div class="fill" style="width: {toast.progress * 100}%" /></div>
    <div class="stat">
        <span class="label">Video</span>
        <span class="value">{toast.videoNumber} of {toast.videoCount}</span>
    </div>
{/if}

<style>
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

    .detail {
        font-size: var(--md-font-size);
        color: var(--grayed-out-text-color);

        white-space: nowrap;
        text-overflow: ellipsis;
        overflow: hidden;
    }

    .bar {
        width: 100%;
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
        .detail,
        .label {
            font-size: var(--md-font-size);
        }
    }
</style>
