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
    border: 1px solid var(--color-surface-10);
    height: var(--size);
    width: var(--size);
    object-fit: cover;
    object-position: center;
    background: var(--color-surface-10);
  }
</style>
