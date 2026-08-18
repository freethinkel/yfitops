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

  /** At a limit the cursor says which way is still possible. */
  const cursor = $derived.by(() => {
    const grow = side === "left" ? "e-resize" : "w-resize";
    const shrink = side === "left" ? "w-resize" : "e-resize";

    if (width >= maxWidth) return shrink;
    if (width <= minWidth && collapseAt === undefined) return grow;
    return "col-resize";
  });

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

  // the body cursor is set once on mousedown and would otherwise stay whatever
  // it was when the drag started, hiding the limits
  $effect(() => {
    if (isDragging) document.body.style.cursor = cursor;
  });

  const onMouseDown = (event: MouseEvent) => {
    event.preventDefault();
    isDragging = true;
    document.body.style.cursor = cursor;
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
    style:cursor
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
    opacity: 0;
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

    /* just the edge, lit up — no grabber */
    &::before {
      content: "";
      position: absolute;
      top: 0;
      bottom: 0;
      left: 50%;
      width: 1px;
      transform: translateX(-50%);
      background: var(--color-accent);
    }
  }
</style>
