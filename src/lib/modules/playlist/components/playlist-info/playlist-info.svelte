<script lang="ts">
  import type { Snippet } from "svelte";
  import { sanitizeDescription } from "$lib/shared/helpers/sanitize";
  import { Cover } from "$lib/shared/components/cover";

  interface Props {
    children?: Snippet;
    image?: string;
    name?: string;
    description?: string;
  }
  const { image = "", name = "", description = "", children }: Props = $props();

  const html = $derived(sanitizeDescription(description));
</script>

<div class="wrapper">
  <Cover url={image} size={100} icon="music" />

  <div class="info">
    <h1>{name}</h1>
    {#if description}
      <p>{@html html}</p>
    {/if}

    {#if children}
      <div class="actions">{@render children()}</div>
    {/if}
  </div>
</div>

<style>
  .wrapper {
    display: flex;
    gap: 0.875rem;
    padding: 0.625rem;
  }
  .info {
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    min-width: 0;
  }
  /* the app is user-select: none — the title and blurb are the exception */
  h1,
  p {
    -webkit-user-select: text;
    user-select: text;
    cursor: text;
  }
  .actions {
    display: flex;
    gap: 0.5rem;
    margin-top: 0.625rem;
  }
  h1 {
    margin: 0;
    font-size: 1.5rem;
    line-height: 1.2;
  }
  p :global(a) {
    color: inherit;
    text-decoration: underline;
    cursor: pointer;
  }
  p {
    margin: 0.25rem 0 0;
    font-size: 0.84rem;
    color: oklch(from var(--color-text) l c h / 0.6);
  }
</style>
