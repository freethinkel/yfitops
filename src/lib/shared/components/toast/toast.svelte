<script lang="ts">
  import { $lastError as lastError, dismissError } from "$lib/shared/helpers/errors";
</script>

{#if $lastError}
  <button class="toast" type="button" onclick={dismissError}>
    {$lastError}
  </button>
{/if}

<style>
  /* above the player bar, out of the way of the controls */
  .toast {
    position: absolute;
    left: 50%;
    bottom: 6.25rem;
    transform: translateX(-50%);
    max-width: min(32rem, calc(100% - 2rem));
    appearance: none;
    border: none;
    border-radius: var(--border-radius);
    padding: 0.5rem 0.75rem;
    font-size: 0.75rem;
    line-height: 1.3;
    text-align: left;
    color: #fff;
    background: oklch(from red 0.45 0.16 h);
    box-shadow: 0 0.5rem 1.5rem rgba(0, 0, 0, 0.35);
    cursor: pointer;
    z-index: 10;

    &:hover {
      opacity: 0.85;
    }
  }
</style>
