<script lang="ts">
  import { prettyPrintFloat } from "../../printers/number";

  export let stdErr: number | null | undefined;
  export let inline = false;
</script>

{#if stdErr != null}
  <span class="std-err" class:inline title="Standard error of the OPR estimate">
    ± {prettyPrintFloat(stdErr)}
  </span>
{/if}

<style>
  .std-err {
    display: block;
    font-size: var(--sm-font-size);
    color: var(--secondary-text-color);
  }

  .std-err.inline {
    display: inline;
  }
</style>
