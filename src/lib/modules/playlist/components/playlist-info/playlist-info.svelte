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
  <Cover url={image} size={100} icon="playlist" />

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
    gap: 14px;
    padding: 10px;
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
    user-select: text;
    cursor: text;
  }
  .actions {
    display: flex;
    gap: 8px;
    margin-top: 10px;
  }
  h1 {
    margin: 0;
    font-size: 1.6rem;
    line-height: 1.2;
  }
  p :global(a) {
    color: inherit;
    text-decoration: underline;
    cursor: pointer;
  }
  p {
    margin: 4px 0 0;
    font-size: 0.9rem;
    color: var(--color-text-60);
  }
</style>
