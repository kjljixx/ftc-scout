<script lang="ts">
    import Fa from "svelte-fa";
    import { faPlay } from "@fortawesome/free-solid-svg-icons";

    export let ready: boolean;
</script>

<span class="video-badge" class:ready class:lookup={!ready} aria-hidden="true">
    <Fa icon={faPlay} />
</span>

<style>
    .video-badge {
        --size: var(--video-badge-size, 18px);

        display: inline-grid;
        place-items: center;
        flex: none;

        width: var(--size);
        height: var(--size);
        border-radius: 50%;

        font-size: calc(var(--size) * 0.42);
        text-indent: 0.1em;

        transition: opacity 0.12s ease 0s;
    }

    .ready {
        background: #e62117;
        color: white;
    }

    :global(body.dark) .ready {
        background: #ff4e45;
    }

    .lookup {
        border: 1.5px solid var(--faint-text-color);
        color: var(--faint-text-color);
    }
</style>
