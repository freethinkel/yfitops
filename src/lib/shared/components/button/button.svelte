<script lang="ts">
  import type { Snippet } from "svelte";
  import type { HTMLButtonAttributes } from "svelte/elements";

  interface Props extends HTMLButtonAttributes {
    kind?: "filled" | "ghost";
    children: Snippet;
  }
  const { kind = "filled", children, ...rest }: Props = $props();
</script>

<button class="button kind__{kind}" type="button" {...rest}>
  {@render children()}
</button>

<style>
  .button {
    appearance: none;
    height: 28px;
    padding: 0 12px;
    border-radius: 10em;
    font-size: 0.9rem;
    font-weight: 600;
    font-family: inherit;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: var(--transition);
    /* -apple-visual-effect: -apple-system-glass-material; */

    &:disabled {
      opacity: 0.5;
      cursor: default;
    }

    &.kind__filled {
      background: var(--color-accent-100);
      border: 1px solid var(--color-surface-10);
      color: var(--color-background-100);
      -apple-visual-effect: -apple-system-glass-material-clear;
      transition: var(--spring-transiton);

      &:active {
        transform: scale(0.98);
      }
    }

    &.kind__ghost {
      background: transparent;
      border: none;
      color: var(--color-text-100);

      &:hover:not(:disabled) {
        background: var(--color-surface-10);
      }
    }
  }
</style>
