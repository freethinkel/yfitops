<script lang="ts">
  import { Icon } from "$lib/shared/components/icon";

  interface Props {
    value?: string;
    placeholder?: string;
    oninput?: (value: string) => void;
  }
  const { value = "", placeholder = "", oninput }: Props = $props();
</script>

<div class="field">
  <Icon name="search" size={16} />
  <input
    type="search"
    {placeholder}
    {value}
    oninput={(event) => oninput?.(event.currentTarget.value)}
  />
</div>

<style>
  .field {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin: 0.625rem;
    padding: 0 0.625rem;
    height: 34px;
    border-radius: var(--border-radius);
    /* background: oklch(from var(--color-text) l c h / 0.04); */
    color: oklch(from var(--color-text) l c h / 0.6);

    @supports (-apple-visual-effect: -apple-system-glass-material) {
      background: transparent;
      -apple-visual-effect: -apple-system-glass-material-media-controls;
      border-radius: 10rem;

      :global(body:not(.window__focused)) & {
        -apple-visual-effect: -apple-system-glass-material-media-controls-subdued;
      }
    }

    &:focus-within {
      border-color: var(--color-accent);
    }
  }
  input {
    flex: 1;
    min-width: 0;
    appearance: none;
    border: none;
    background: none;
    outline: none;
    font-size: 0.94rem;
    color: var(--color-text);

    &::-webkit-search-cancel-button {
      appearance: none;
    }
  }
</style>
