const ZONE = 44;
const SPEED = 14;

/**
 * Scrolls the node while a drag hovers near its top or bottom edge — the
 * closer to the edge, the faster.
 */
export const autoscroll = (node: HTMLElement) => {
  let frame = 0;
  let speed = 0;

  const tick = () => {
    node.scrollTop += speed;
    frame = speed ? requestAnimationFrame(tick) : 0;
  };

  const onDragOver = (event: DragEvent) => {
    const { top, bottom } = node.getBoundingClientRect();
    const fromTop = event.clientY - top;
    const fromBottom = bottom - event.clientY;

    speed =
      fromTop < ZONE
        ? -SPEED * (1 - fromTop / ZONE)
        : fromBottom < ZONE
          ? SPEED * (1 - fromBottom / ZONE)
          : 0;

    if (speed && !frame) frame = requestAnimationFrame(tick);
  };

  const stop = () => (speed = 0);

  node.addEventListener("dragover", onDragOver);
  node.addEventListener("dragleave", stop);
  node.addEventListener("drop", stop);
  addEventListener("dragend", stop);

  return {
    destroy() {
      node.removeEventListener("dragover", onDragOver);
      node.removeEventListener("dragleave", stop);
      node.removeEventListener("drop", stop);
      removeEventListener("dragend", stop);
      cancelAnimationFrame(frame);
    },
  };
};
