<script lang="ts">
    import { toast } from "$lib/game/game-store";
    import Toast from "../Toast.svelte";
</script>

{#if $toast}
    <Toast position="bottom-center" role="status" aria-live="polite">{$toast}</Toast>
{/if}
