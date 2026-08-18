<script lang="ts">
  import type { Snippet } from "svelte";
  import { Skeleton } from "$lib/shared/components/skeleton";

  interface Props {
    title: string;
    /** null while loading; an empty array means the endpoint gave nothing. */
    loaded: boolean;
    empty: boolean;
    children?: Snippet;
  }
  const { title, loaded, empty, children }: Props = $props();
</script>

{#if !loaded || !empty}
  <section>
    <h2>{title}</h2>

    <div class="row">
      {#if loaded}
        {@render children?.()}
      {:else}
        {#each Array(6) as _, index (index)}
          <div class="skeleton">
            <Skeleton width="128px" height="128px" />
            <Skeleton width="100px" height="14px" />
          </div>
        {/each}
      {/if}
    </div>
  </section>
{/if}

<style>
  section {
    padding: 10px 0;
  }
  h2 {
    margin: 0 0 4px;
    padding: 0 16px;
    font-size: 1.1rem;
  }
  .row {
    display: flex;
    gap: 4px;
    overflow-x: auto;
    padding: 0 10px;
    scrollbar-width: none;

    &::-webkit-scrollbar {
      display: none;
    }
  }
  .skeleton {
    width: 140px;
    flex-shrink: 0;
    padding: 6px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
</style>
