<script lang="ts">
  import { Icon } from "$lib/shared/components/icon";

  interface Props {
    url?: string;
    size?: number;
    icon?: string;
  }
  const { url = "", size = 40, icon = "music" }: Props = $props();
</script>

<div class="wrapper" style:--size="{size}px">
  {#if url}
    <img src={url} alt="" />
  {/if}
  <Icon name={icon} size={size / 1.5} />
</div>

<style>
  .wrapper {
    display: flex;
    position: relative;
    /* keeps the img's z-index inside the cover, off sticky headers above it */
    isolation: isolate;
    width: var(--size);
    min-width: var(--size);
    height: var(--size);
    border-radius: var(--border-radius);
    border: 1px solid var(--color-surface-10);
    overflow: hidden;
    background: var(--color-surface-10);

    & :global(div.icon) {
      display: flex;
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      align-items: center;
      justify-content: center;
      color: var(--color-text-60);
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
