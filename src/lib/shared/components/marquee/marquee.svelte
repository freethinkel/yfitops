<script lang="ts">
  interface Props {
    text: string;
    /** Seconds per 100px of overflow — keeps long titles from racing. */
    speed?: number;
  }
  const { text, speed = 6 }: Props = $props();

  const GAP_PX = 32;

  let outerEl = $state<HTMLDivElement>();
  let innerEl = $state<HTMLSpanElement>();
  let overflow = $state(0);

  const duration = $derived(((overflow + GAP_PX) / 100) * speed);

  /** Only text that does not fit scrolls; the rest stays put. */
  $effect(() => {
    // read `text` so the measurement redoes itself on every track change
    void text;

    if (!outerEl || !innerEl) return;

    const measure = () => {
      const available = outerEl!.clientWidth;
      const needed = innerEl!.scrollWidth;
      overflow = Math.max(0, needed - available);
    };

    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(outerEl);

    return () => observer.disconnect();
  });
</script>

<div class="marquee" bind:this={outerEl} class:scrolling={overflow > 0}>
  <div
    class="row"
    style:--shift="-{overflow + GAP_PX}px"
    style:--duration="{duration}s"
    style:--gap="{GAP_PX}px"
  >
    <span bind:this={innerEl}>{text}</span>
    {#if overflow > 0}
      <span aria-hidden="true">{text}</span>
    {/if}
  </div>
</div>

<style>
  .marquee {
    min-width: 0;
    overflow: hidden;
  }
  .row {
    display: flex;
    gap: var(--gap);
    width: max-content;
  }
  span {
    white-space: nowrap;
  }
  /* only text that actually scrolls needs the edges softened */
  .scrolling {
    mask-image: linear-gradient(
      to right,
      transparent 0,
      black 0.75rem,
      black calc(100% - 0.75rem),
      transparent 100%
    );
  }
  .scrolling .row {
    animation: marquee var(--duration) linear infinite;
    /* a beat at the start so the title can be read before it moves */
    animation-delay: 1.5s;
  }

  @keyframes marquee {
    from {
      transform: translateX(0);
    }
    to {
      transform: translateX(var(--shift));
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .scrolling .row {
      animation: none;
    }
  }
</style>
