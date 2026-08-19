<script module lang="ts">
  /**
   * Vite hands the same module back on a second import, but the await still
   * costs a microtask and a second render pass — and every row in the track
   * table mounts several of these. Shared across instances on purpose: once any
   * icon has loaded, every later one renders it synchronously.
   */
  const loaded = new Map<string, string>();
</script>

<script lang="ts">
  interface Props {
    name: string;
    size?: number;
  }
  const { name, size = 20 }: Props = $props();

  let content = $state("");

  $effect(() => {
    const cached = loaded.get(name);

    if (cached !== undefined) {
      content = cached;
      return;
    }

    // a rapid name change must not let the slower import win
    let current = true;

    import(`./icons/${name}.svg?raw`).then((module) => {
      loaded.set(name, module.default);
      if (current) content = module.default;
    });

    return () => {
      current = false;
    };
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
