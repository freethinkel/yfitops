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
    <img src={url} alt="" />
  {/if}
  <Icon name={icon} size={size / 1.5} />
</div>

<style>
  .wrapper.fill {
    width: 100%;
    min-width: 0;
    height: auto;
    aspect-ratio: 1;
  }
  .wrapper {
    display: flex;
    position: relative;
    isolation: isolate;
    width: var(--size);
    min-width: var(--size);
    height: var(--size);
    border-radius: var(--border-radius);
    border: 1px solid oklch(from var(--color-text) l c h / 0.08);
    overflow: hidden;
    background: oklch(from var(--color-text) l c h / 0.04);

    & :global(div.icon) {
      display: flex;
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      align-items: center;
      justify-content: center;
      color: oklch(from var(--color-text) l c h / 0.4);
    }
  }
  img {
    height: 100%;
    width: 100%;
    object-fit: cover;
    position: absolute;
    z-index: 1;
  }
</style>
