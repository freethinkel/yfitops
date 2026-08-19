<script lang="ts">
  import { Icon } from "$lib/shared/components/icon";

  interface Props {
    url?: string;
    size?: number;
    icon?: string;
    /** Takes the container's width and stays square — for resizable panels. */
    fill?: boolean;
  }
  const { url = "", size = 40, icon = "music", fill = false }: Props = $props();
</script>

<div class="wrapper" class:fill style:--size="{size}px">
  {#if url}
    <!-- decoding off the main thread: a flick brings a screenful of these in at
         once, and a synchronous decode would land inside the scroll frame -->
    <img src={url} alt="" decoding="async" />
  {:else}
    <!-- only without artwork: the track table draws one cover per row, and the
         placeholder used to be built underneath every single one of them -->
    <Icon name={icon} size={size / 1.5} />
  {/if}
</div>

<style>
  .wrapper.fill {
    width: 100%;
    min-width: 0;
    height: auto;
    aspect-ratio: 1;
  }
  /* the image and the placeholder are mutually exclusive now, so neither needs
     to be lifted out of flow — one stacking context less per cover */
  .wrapper {
    display: flex;
    align-items: center;
    justify-content: center;
    width: var(--size);
    min-width: var(--size);
    height: var(--size);
    border-radius: var(--border-radius);
    border: 1px solid oklch(from var(--color-text) l c h / 0.08);
    overflow: hidden;
    background: oklch(from var(--color-text) l c h / 0.04);

    & :global(div.icon) {
      color: oklch(from var(--color-text) l c h / 0.4);
    }
  }
  img {
    height: 100%;
    width: 100%;
    object-fit: cover;
  }
</style>
