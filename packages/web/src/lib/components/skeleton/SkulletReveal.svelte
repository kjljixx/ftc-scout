<script lang="ts">
    import "skullet/element";
    import "skullet/styles.css";
    import { onMount } from "svelte";

    export let label = "Loading";

    let source: HTMLDivElement;

    // Skullet measures its children when it connects, but Svelte mounts slot content after
    // inserting the parent element. So the element is built with its children already inside.
    onMount(() => {
        const reveal = document.createElement("skullet-reveal");
        reveal.setAttribute("loading", "");
        reveal.setAttribute("label", label);
        reveal.append(...source.childNodes);
        source.replaceWith(reveal);

        console.debug(`[skullet] drawing skeleton from sample content: "${label}"`);
        return () => reveal.remove();
    });
</script>

<div bind:this={source}>
    <slot />
</div>
