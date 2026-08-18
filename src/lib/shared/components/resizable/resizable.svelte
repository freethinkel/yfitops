<script lang="ts">
  import type { Snippet } from "svelte";

  interface Props {
    width: number;
    minWidth?: number;
    maxWidth?: number;
    /** Which edge the handle sits on — the opposite one stays put. */
    side?: "left" | "right";
    /** Dragging narrower than this collapses the panel instead of resizing. */
    collapseAt?: number;
    onresize: (width: number) => void;
    oncollapse?: () => void;
    children: Snippet;
  }
  const {
    width,
    minWidth = 150,
    maxWidth = 500,
    side = "left",
    collapseAt,
    onresize,
    oncollapse,
    children,
  }: Props = $props();

  let isDragging = $state(false);

  const stop = () => {
    isDragging = false;
    document.body.style.cursor = "";
    document.removeEventListener("mousemove", onMouseMove);
    document.removeEventListener("mouseup", stop);
  };

  const onMouseMove = (event: MouseEvent) => {
    event.preventDefault();

    const raw =
      side === "left" ? event.pageX : window.innerWidth - event.pageX;

    if (collapseAt !== undefined && raw < collapseAt) {
      stop();
      oncollapse?.();
      return;
    }

    onresize(Math.min(maxWidth, Math.max(minWidth, raw)));
  };

  const onMouseDown = (event: MouseEvent) => {
    event.preventDefault();
    isDragging = true;
    document.body.style.cursor = "col-resize";
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", stop);
  };
</script>

<div class="wrapper" style:width="{width}px">
  {@render children()}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="drag drag__{side}"
    class:active={isDragging}
    onmousedown={onMouseDown}
  ></div>
</div>

<style>
  .wrapper {
    height: 100%;
    position: relative;
    flex-shrink: 0;
  }
  .drag {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 6px;
    background: var(--color-accent-20);
    opacity: 0;
    cursor: col-resize;
    transition: var(--transition);
    z-index: 1000;

    &.drag__left {
      right: 0;
      transform: translateX(50%);
    }
    &.drag__right {
      left: 0;
      transform: translateX(-50%);
    }

    &:hover,
    &.active {
      opacity: 1;
    }

    &::before {
      content: "";
      position: absolute;
      height: 20px;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 3px;
      border-radius: 10em;
      background: var(--color-accent-100);
    }
  }
</style>
