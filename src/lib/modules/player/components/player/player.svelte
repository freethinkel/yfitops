<script lang="ts">
  import { appModel } from "$lib/modules/app/model";
  import { themeModel } from "$lib/modules/theme/model";
  import { Icon } from "$lib/shared/components/icon";
  import { playerModel } from "../../model";
  import Controls from "../controls/controls.svelte";
  import Progress from "../progress/progress.svelte";
  import TrackInfo from "../track-info/track-info.svelte";

  const detailsOpen = appModel.$detailsOpen;
  const detailsView = appModel.$detailsView;
  const trackColor = playerModel.$trackColor;
  const theme = themeModel.$theme;

  const color = $derived(
    $trackColor === "transparent"
      ? $theme.background
      : `color-mix(in srgb, ${$trackColor} 50%, ${$theme.background})`,
  );
</script>

<div class="wrapper" style:--track-color={color}>
  <div class="left">
    <TrackInfo />
  </div>
  <div class="center">
    <Controls />
    <Progress thumbBorderColor={color} />
  </div>
  <div class="right">
    <button
      class:active={$detailsOpen && $detailsView === "now-playing"}
      type="button"
      aria-label="Toggle lyrics"
      aria-pressed={$detailsOpen && $detailsView === "now-playing"}
      onclick={() => appModel.showDetails("now-playing")}
    >
      <Icon name="lyrics" />
    </button>
    <button
      class:active={$detailsOpen && $detailsView === "queue"}
      type="button"
      aria-label="Toggle queue"
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
    border: 1px solid var(--color-surface-20);
    border-radius: 999px;
    box-shadow:
      var(--shadow-1),
      0 12px 32px -10px color-mix(in srgb, var(--track-color) 70%, transparent);
    /* a smaller inset and the pill's own curve would clip the artwork */
    padding: 4px 14px;
    position: relative;
    overflow: hidden;

    &::before {
      content: "";
      position: absolute;
      inset: 0;
      /* background-color: var(--track-color, var(--color-background-100)); */
      z-index: -2;
    }
    &::after {
      content: "";
      position: absolute;
      inset: 0;
      /* background-color: var(--color-background-100); */
      opacity: 0.2;
      z-index: -1;
    }

    /* macOS/iOS 26+ in the Tauri webview: the system material replaces the
       painted background, the album color stays as a tint on top of it */
    @supports (-apple-visual-effect: -apple-system-glass-material) {
      background: transparent;
      -apple-visual-effect: -apple-system-glass-material-media-controls;
      border-color: transparent;
      /* the material brings its own edge and shadow — ours spilled past it */
      box-shadow: none;

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
    z-index: 1;
  }
  .left {
    display: flex;
    align-items: center;
    flex: 1;
    min-width: 0;
  }
  .center {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    flex: 1;
    min-width: 0;
  }
  .right {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 2px;
    padding-right: 6px;
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
    color: var(--color-text-60);
    cursor: pointer;
    transition: var(--transition);

    &:hover {
      background: var(--color-surface-10);
    }
    &.active {
      color: var(--color-text-100);
      background: var(--color-surface-20);
    }
  }
</style>
