<script lang="ts">
  interface Props {
    value?: number;
    thumbBorderColor?: string | null;
    onchange?: (value: number) => void;
    ondragging?: (dragging: boolean) => void;
  }
  const {
    value = 0,
    thumbBorderColor = null,
    onchange,
    ondragging,
  }: Props = $props();

  let wrapperEl = $state<HTMLDivElement>();
  let isDragging = $state(false);
  let draggedPosition = $state(0);

  const position = $derived(isDragging ? draggedPosition : value);

  const onMousemove = (event: MouseEvent) => {
    event.preventDefault();
    const rect = wrapperEl!.getBoundingClientRect();
    draggedPosition = Math.min(
      1,
      Math.max(0, (event.pageX - rect.left) / rect.width),
    );
  };

  const onMouseup = () => {
    document.removeEventListener("mousemove", onMousemove);
    document.removeEventListener("mouseup", onMouseup);

    onchange?.(draggedPosition);
    isDragging = false;
    ondragging?.(false);
  };

  const onMousedown = (event: MouseEvent) => {
    event.preventDefault();
    draggedPosition = value;
    isDragging = true;
    ondragging?.(true);
    document.addEventListener("mousemove", onMousemove);
    document.addEventListener("mouseup", onMouseup);
  };
</script>

<div
  class="wrapper"
  class:dragging={isDragging}
  bind:this={wrapperEl}
  style:--value="{position * 100}%"
  style:--color-thumb-border={thumbBorderColor}
>
  <button class="thumb" aria-label="Seek" onmousedown={onMousedown}></button>

  <div class="track">
    <div class="track__value"></div>
  </div>
</div>

<style>
  .wrapper {
    display: flex;
    position: relative;

    &:hover .thumb,
    &.dragging .thumb {
      opacity: 1;
    }
  }
  .thumb {
    --size: 17px;
    height: var(--size);
    width: var(--size);
    border-radius: 10em;
    display: flex;
    background: var(--color-surface-100);
    padding: 0;
    margin: 0;
    position: absolute;
    left: var(--value);
    top: 50%;
    transform: translate(-50%, -50%);
    transition: var(--transition);
    opacity: 0;
    border: 3px solid var(--color-thumb-border, var(--color-surface-100));
    z-index: 2;
    cursor: pointer;
  }
  .track {
    height: 4px;
    border-radius: 10em;
    background: var(--color-surface-10);
    width: 100%;

    &__value {
      position: absolute;
      left: 0;
      height: 100%;
      background: var(--color-surface-100);
      width: var(--value);
      border-radius: 10em;
    }
  }
</style>
