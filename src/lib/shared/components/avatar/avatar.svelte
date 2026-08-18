<script lang="ts">
  interface Props {
    source?: string;
    size?: number;
  }
  const { source = "", size = 20 }: Props = $props();
</script>

<img src={source} style:--size="{size}px" alt="" />

<style>
  img {
    border-radius: 10em;
    border: 1px solid oklch(from var(--color-text) l c h / 0.04);
    height: var(--size);
    width: var(--size);
    object-fit: cover;
    object-position: center;
    background: oklch(from var(--color-text) l c h / 0.04);
  }
</style>
