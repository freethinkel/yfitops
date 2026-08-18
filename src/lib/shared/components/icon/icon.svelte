<script lang="ts">
  interface Props {
    name: string;
    size?: number;
  }
  const { name, size = 20 }: Props = $props();

  let content = $state("");

  const loadContent = async (name: string) => {
    const module = await import(`./icons/${name}.svg?raw`);
    content = module.default;
  };

  $effect(() => {
    loadContent(name);
  });
</script>

<div class="icon" style:--size="{size}px">
  {@html content}
</div>

<style>
  .icon {
    display: inline-flex;
  }
  .icon :global(svg) {
    width: var(--size);
    height: var(--size);
  }
</style>
