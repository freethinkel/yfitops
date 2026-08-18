<script lang="ts">
  import type { Snippet } from "svelte";
  import { page } from "$app/state";
  import { Icon } from "$lib/shared/components/icon";

  interface Props {
    href: string;
    icon: string;
    color?: string;
    /** Called with the drag event when something droppable lands here. */
    ondropitem?: (event: DragEvent) => void;
    accepts?: (event: DragEvent) => boolean;
    children: Snippet;
  }
  const {
    href,
    icon,
    color = "",
    ondropitem,
    accepts,
    children,
  }: Props = $props();

  let over = $state(false);
</script>

<a
  {href}
  class="sidebar_btn"
  class:active={page.url.pathname === href}
  class:over
  ondragover={(event) => {
    if (!ondropitem || !(accepts?.(event) ?? true)) return;
    event.preventDefault();
    over = true;
  }}
  ondragleave={() => (over = false)}
  ondrop={(event) => {
    over = false;
    ondropitem?.(event);
  }}
>
  <span class="icon__wrapper" style:--color={color}>
    <Icon name={icon} />
  </span>
  <span class="inner">{@render children()}</span>
</a>

<style>
  .sidebar_btn {
    appearance: none;
    color: var(--color-text-100);
    display: flex;
    align-items: center;
    gap: 5px;
    text-decoration: none;
    background: transparent;
    border-radius: var(--border-radius);
    height: 28px;
    padding: 0 6px;
    font-size: 0.9rem;

    &:hover,
    &.active {
      background: var(--color-surface-10);
    }
    &.over {
      background: var(--color-accent-20);
    }
  }
  .icon__wrapper {
    display: flex;
    color: var(--color, var(--color-text-60));
  }
  .inner {
    overflow: hidden;
    white-space: nowrap;
  }
</style>
