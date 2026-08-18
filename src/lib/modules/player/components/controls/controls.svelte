<script lang="ts">
  import { Icon } from "$lib/shared/components/icon";
  import { playerModel } from "../../model";

  const playerState = playerModel.$playerState;
</script>

<div class="controls">
  <button
    aria-label="Previous track"
    onclick={() => playerModel.prevTrack()}
    disabled={!$playerState?.track_window.previous_tracks.length}
  >
    <Icon name="previous-track" />
  </button>
  <button
    aria-label="Play/pause"
    class="play"
    onclick={() => playerModel.togglePlaypause()}
  >
    <Icon name={$playerState?.paused ?? true ? "play" : "pause"} />
  </button>
  <button aria-label="Next track" onclick={() => playerModel.nextTrack()}>
    <Icon name="next-track" />
  </button>
</div>

<style>
  .controls {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 0 6px;

    color: var(--color-text-80);

    & button {
      --size: 32px;
      appearance: none;
      border: none;
      background: none;
      padding: 0;
      display: flex;
      height: var(--size);
      width: var(--size);
      align-items: center;
      justify-content: center;
      cursor: pointer;

      &:disabled {
        opacity: 0.4;
        cursor: default;
      }

      &.play {
        color: var(--color-text-100);
      }

      &:hover:not(:disabled) {
        color: var(--color-text-100);
      }
    }
  }
</style>
