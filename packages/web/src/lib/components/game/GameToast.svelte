<script lang="ts">
    import { fly } from "svelte/transition";
    import { toast } from "$lib/game/game-store";
</script>

{#if $toast}
    <div class="toast" transition:fly={{ y: 40, duration: 200 }}>{$toast}</div>
{/if}

<style>
    .toast {
        position: fixed;
        bottom: var(--vl-gap);
        left: 50%;
        transform: translateX(-50%);
        z-index: var(--modal-zi);

        background: var(--fg-color);
        border: 1px solid var(--focused-team-ring-color);
        border-radius: var(--pill-border-radius);
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.5);

        padding: var(--md-pad) calc(var(--md-pad) * 2);
        white-space: nowrap;
    }
</style>
