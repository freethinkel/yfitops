<script lang="ts">
  import { goto } from "$app/navigation";
  import { routeForLink } from "$lib/shared/helpers/spotify-link";
  import { onMount } from "svelte";
  import { themeModel } from "$lib/modules/theme/model";
  import type { LayoutProps } from "./$types";

  const { children }: LayoutProps = $props();

  const themeStyles = themeModel.$themeStyles;
  let styleEl: HTMLStyleElement;

  /**
   * macOS dims its chrome when a window loses focus; styles can follow suit.
   * document.hasFocus covers the initial state, which the events do not fire for.
   */
  onMount(() => {
    const update = () =>
      document.body.classList.toggle("window__focused", document.hasFocus());

    update();
    addEventListener("focus", update);
    addEventListener("blur", update);

    return () => {
      removeEventListener("focus", update);
      removeEventListener("blur", update);
    };
  });

  onMount(() => {
    styleEl = document.createElement("style");
    document.head.appendChild(styleEl);

    return () => styleEl.remove();
  });

  /**
   * Spotify links show up in descriptions and anywhere else the API sends
   * markup. Following one would navigate the webview away from the app, so
   * they are caught here and routed internally.
   */
  const onClick = (event: MouseEvent) => {
    const link = (event.target as HTMLElement | null)?.closest?.("a");
    const href = link?.getAttribute("href");
    if (!href) return;

    const route = routeForLink(href);
    if (!route) return;

    event.preventDefault();
    goto(route);
  };

  $effect(() => {
    if (styleEl) styleEl.innerHTML = $themeStyles;
  });
</script>

<svelte:document onclick={onClick} />

{@render children()}
