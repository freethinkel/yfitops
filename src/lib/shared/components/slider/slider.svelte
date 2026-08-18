<script lang="ts">
  interface Props {
    value?: number;
    label?: string;
    onchange?: (value: number) => void;
    ondragging?: (dragging: boolean) => void;
  }
  const { value = 0, label = "Seek", onchange, ondragging }: Props = $props();

  const STEP = 0.01;
  const BIG_STEP = 0.05;

  const clamp = (value: number) => Math.min(1, Math.max(0, value));

  let trackEl = $state<HTMLDivElement>();
  let isDragging = $state(false);
  let draggedValue = $state(0);

  const position = $derived(clamp(isDragging ? draggedValue : value));

  const valueAt = (clientX: number) => {
    const rect = trackEl!.getBoundingClientRect();
    return rect.width ? clamp((clientX - rect.left) / rect.width) : 0;
  };

  /**
   * Listening on the window rather than capturing the pointer: WebKit drops
   * captured moves often enough that the thumb stops following the cursor.
   */
  const onPointerMove = (event: PointerEvent) => {
    draggedValue = valueAt(event.clientX);
  };

  const onPointerUp = () => {
    removeEventListener("pointermove", onPointerMove);
    removeEventListener("pointerup", onPointerUp);
    removeEventListener("pointercancel", onPointerUp);

    isDragging = false;
    ondragging?.(false);
    onchange?.(draggedValue);
  };

  const onPointerDown = (event: PointerEvent) => {
    if (event.button !== 0) return;

    event.preventDefault();

    // pressing anywhere on the track seeks there, no need to grab the thumb
    draggedValue = valueAt(event.clientX);
    isDragging = true;
    ondragging?.(true);

    addEventListener("pointermove", onPointerMove);
    addEventListener("pointerup", onPointerUp);
    addEventListener("pointercancel", onPointerUp);
  };

  const onKeyDown = (event: KeyboardEvent) => {
    const step = event.shiftKey ? BIG_STEP : STEP;

    const next = {
      ArrowLeft: position - step,
      ArrowRight: position + step,
      ArrowDown: position - step,
      ArrowUp: position + step,
      Home: 0,
      End: 1,
    }[event.key];

    if (next === undefined) return;

    event.preventDefault();
    onchange?.(clamp(next));
  };
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div
  class="slider"
  class:dragging={isDragging}
  style:--value="{position * 100}%"
  role="slider"
  tabindex="0"
  aria-label={label}
  aria-valuemin={0}
  aria-valuemax={100}
  aria-valuenow={Math.round(position * 100)}
  bind:this={trackEl}
  onpointerdown={onPointerDown}
  onkeydown={onKeyDown}
>
  <div class="track">
    <div class="track__value"></div>
  </div>

  <div class="thumb"></div>
</div>

<style>
  .slider {
    position: relative;
    display: flex;
    align-items: center;
    width: 100%;
    /* a thin line is hard to hit — the padding widens the grab area */
    padding: 0.375rem 0;
    cursor: pointer;
    touch-action: none;

    &:hover .thumb,
    &.dragging .thumb,
    &:focus-visible .thumb {
      opacity: 1;
      transform: translate(-50%, -50%) scale(1);
    }

    &:focus-visible {
      outline: none;
    }
  }
  .track {
    height: 0.281rem;
    width: 100%;
    border-radius: 10em;
    background: oklch(from var(--color-text) l c h / 0.12);
    overflow: hidden;
  }
  .track__value {
    height: 100%;
    width: var(--value);
    border-radius: 10em;
    background: var(--color-text);
  }
  .thumb {
    --size: 1.031rem;

    position: absolute;
    left: var(--value);
    top: 50%;
    height: var(--size);
    width: var(--size);
    border-radius: 10em;
    background: var(--color-accent);
    box-shadow:
      var(--shadow-1),
      0 0 0 1px oklch(from var(--color-text) l c h / 0.12);
    opacity: 0;
    transform: translate(-50%, -50%) scale(0.6);
    /* everything but `left`: animating the position makes the thumb lag
       behind the cursor while dragging */
    transition:
      opacity var(--transition),
      transform var(--transition),
      width var(--transition),
      height var(--transition);
    pointer-events: none;
    z-index: 2;
  }
  .dragging .thumb {
    --size: 1.219rem;
  }
</style>
