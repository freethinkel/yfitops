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
    height: 1.86rem;
    padding: 0 0.75rem;
    border-radius: 10em;
    font-size: 0.84rem;
    font-weight: 600;
    font-family: inherit;
    display: inline-flex;
    gap: 0.375rem;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: var(--spring-transition);

    &:disabled {
      opacity: 0.5;
      cursor: default;
    }

    &:active {
      transform: scale(0.98);
    }

    &.kind__filled {
      height: 1.84rem;
      background: var(--color-accent);
      border: 1px solid oklch(from var(--color-text) l c h / 0.04);
      color: var(--color-background);
      transition: var(--spring-transition);

      @supports (-apple-visual-effect: -apple-system-glass-material-clear) {
        -apple-visual-effect: -apple-system-glass-material-clear;
      }
    }

    &.kind__ghost {
      background: transparent;
      border: none;
      color: var(--color-text);

      @supports (-apple-visual-effect: -apple-system-glass-material) {
        background: transparent;
        -apple-visual-effect: -apple-system-glass-material;
      }

      &:hover:not(:disabled) {
        background: oklch(from var(--color-text) l c h / 0.04);
      }
    }
  }
</style>
