<script lang="ts">
  import { faChevronDown } from "@fortawesome/free-solid-svg-icons";
  import Fa from "svelte-fa";

  let open = false;
</script>

<button type="button" aria-expanded={open} on:click={() => (open = !open)}>
  Additional information<Fa
    icon={faChevronDown}
    style={`height: 0.75em; width: 0.75em; margin-left: 0.55em; vertical-align: -1px; transform-origin: 50% 56%; transform: rotate(${
      open ? 180 : 0
    }deg); transition: transform 0.25s;`}
  />
</button>

{#if open}
  <slot />
{/if}

<style>
  button {
    align-self: flex-start;
    padding: 0;
    border: none;
    background: none;
    color: var(--secondary-text-color);
    font: inherit;
    cursor: pointer;
  }

  button:hover {
    color: var(--text-color);
  }
</style>
