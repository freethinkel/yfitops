<script lang="ts">
  import { appModel } from "$lib/modules/app/model";
  import { Icon } from "$lib/shared/components/icon";
  import { playerModel } from "../../model";
  import { playerMessages } from "$lib/modules/i18n";
  import Controls from "../controls/controls.svelte";
  import Progress from "../progress/progress.svelte";
  import TrackInfo from "../track-info/track-info.svelte";

  const t = playerMessages;
  const detailsOpen = appModel.$detailsOpen;
  const detailsView = appModel.$detailsView;
  const trackColor = playerModel.$trackColor;

  // mixed in CSS so it follows the palette the OS is currently asking for
  const color = $derived(
    $trackColor === "transparent"
      ? "var(--color-background)"
      : `color-mix(in srgb, ${$trackColor} 50%, var(--color-background))`,
  );
</script>

<div class="wrapper" style:--track-color={color}>
  <div class="left">
    <Controls />
  </div>
  <div class="center">
    <TrackInfo />
    <Progress />
  </div>
  <div class="right">
    <button
      class:active={$detailsOpen && $detailsView === "now-playing"}
      type="button"
      aria-label={$t.toggleLyrics}
      aria-pressed={$detailsOpen && $detailsView === "now-playing"}
      onclick={() => appModel.showDetails("now-playing")}
    >
      <Icon name="lyrics" />
    </button>
    <button
      class:active={$detailsOpen && $detailsView === "friends"}
      type="button"
      aria-label={$t.toggleFriends}
      aria-pressed={$detailsOpen && $detailsView === "friends"}
      onclick={() => appModel.showDetails("friends")}
    >
      <Icon name="friends" />
    </button>
    <button
      class:active={$detailsOpen && $detailsView === "queue"}
      type="button"
      aria-label={$t.toggleQueue}
      aria-pressed={$detailsOpen && $detailsView === "queue"}
      onclick={() => appModel.showDetails("queue")}
    >
      <Icon name="queue" />
    </button>
  </div>
</div>

<style>
  /* Apple Music's floating capsule: a pill of glass, lit from behind by the
     artwork color */
  .wrapper {
    display: flex;
    align-items: center;
    width: 100%;
    border: 1px solid oklch(from var(--color-text) l c h / 0.12);
    border-radius: 999px;
    box-shadow:
      var(--shadow-1),
      0 12px 32px -10px color-mix(in srgb, var(--track-color) 70%, transparent);
    /* a smaller inset and the pill's own curve would clip the artwork */
    padding: 0.25rem 0.875rem;
    position: relative;
    overflow: hidden;
    gap: 0.281rem;

    &::before {
      content: "";
      position: absolute;
      inset: 0;
      z-index: -2;
    }

    &::after {
      content: "";
      position: absolute;
      inset: 0;
      opacity: 0.2;
      z-index: -1;
    }

    backdrop-filter: blur(10px);
    /* macOS/iOS 26+ in the Tauri webview: the system material replaces the
       painted background, the album color stays as a tint on top of it */
    @supports (-apple-visual-effect: -apple-system-glass-material) {
      background: transparent;
      -apple-visual-effect: -apple-system-glass-material-media-controls;
      border-color: transparent;
      box-shadow: none;
      backdrop-filter: none;
      border: none;

      &::before {
        z-index: 0;
        opacity: 0.14;
        pointer-events: none;
      }
      &::after {
        /* the hairline highlight that makes the pill read as glass */
        display: block;
        background: none;
        opacity: 1;
        z-index: 0;
        border-radius: inherit;
        box-shadow: inset 0 1px 0 color-mix(in srgb, white 25%, transparent);
        pointer-events: none;
      }
    }
  }
  .left,
  .center,
  .right {
    position: relative;
  }
  .left {
    width: 170px;
  }
  .left {
    display: flex;
    align-items: center;
    min-width: 0;
  }
  /**
   * The pill is translucent: a gradient painted over the track info would show
   * the glass through it. So the info is masked away instead of covered.
   * mask-image cannot be transitioned, but mask-position can — the mask is cut
   * twice as tall and slid from its opaque half to its fading one.
   */
  .center :global(.track_info__root) {
    mask-image: linear-gradient(
      to top,
      transparent 0%,
      transparent 20%,
      black 38%,
      black 100%
    );
    mask-size: 100% 200%;
    mask-position: 0% 0%;
    transition: mask-position 0.1s linear;
    will-change: mask-position;
  }
  /* the fade belongs to the slider: it only gets in the way when the times
     next to it come up, not whenever the pointer crosses the capsule */
  .center:has(:global(.progress__root):hover) :global(.track_info__root),
  .center:has(:global(.progress__root.dragging)) :global(.track_info__root) {
    mask-position: 0% 100%;
  }
  .center {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    justify-content: center;
    gap: 0.188rem;
    flex: 1;
    min-width: 0;
  }
  .right {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 0.125rem;
    padding-right: 0.375rem;
  }
  .right button {
    appearance: none;
    border: none;
    background: none;
    display: flex;
    align-items: center;
    justify-content: center;
    height: 30px;
    width: 30px;
    border-radius: var(--border-radius);
    color: oklch(from var(--color-text) l c h / 0.6);
    cursor: pointer;
    transition: var(--transition);

    &:hover {
      background: oklch(from var(--color-text) l c h / 0.04);
    }

    &.active {
      color: var(--color-accent);
      background: oklch(from var(--color-accent) l c h / 0.1);
    }
  }
</style>
