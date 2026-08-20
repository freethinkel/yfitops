<script lang="ts">
  import { Icon } from "$lib/shared/components/icon";
  import { playerModel } from "../../model";
  import { playerMessages } from "$lib/modules/i18n";

  const t = playerMessages;
  const playerState = playerModel.$playerState;
</script>

<div class="controls">
  <button
    class="mode"
    class:active={$playerState?.shuffle}
    aria-label={$t.shuffle}
    aria-pressed={$playerState?.shuffle ?? false}
    onclick={() => playerModel.toggleShuffle()}
  >
    <Icon name="shuffle" size={20} />
  </button>
  <!-- always live: with nothing behind it, the track starts over -->
  <button
    aria-label={$t.previousTrack}
    onclick={() => playerModel.prevTrack()}
    disabled={!$playerState}
  >
    <Icon name="previous-track" size={24} />
  </button>
  <button
    aria-label={$t.playPause}
    class="play"
    class:buffering={$playerState?.loading}
    onclick={() => playerModel.togglePlaypause()}
  >
    <Icon name={($playerState?.paused ?? true) ? "play" : "pause"} size={28} />
  </button>
  <button aria-label={$t.nextTrack} onclick={() => playerModel.nextTrack()}>
    <Icon name="next-track" size={24} />
  </button>

  <button
    class="mode"
    class:active={($playerState?.repeat_mode ?? 0) > 0}
    aria-label={$t.repeat}
    onclick={() => playerModel.cycleRepeat()}
  >
    <Icon
      name={$playerState?.repeat_mode === 2 ? "repeat-one" : "repeat"}
      size={20}
    />
  </button>
</div>

<style>
  .controls {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    color: oklch(from var(--color-text) l c h / 0.8);
    will-change: transform;

    & button {
      transition: transform var(--spring-transition);
      &:active {
        transform: scale(0.9);
      }
    }

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
        color: var(--color-text);
      }

      /* the track is fetched and decoded but no sound has started yet */
      &.buffering {
        animation: buffering 1s ease-in-out infinite;
      }

      &:hover:not(:disabled) {
        color: var(--color-text);
      }
    }
  }

  @keyframes buffering {
    50% {
      opacity: 0.4;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .controls button.buffering {
      animation: none;
      opacity: 0.6;
    }
  }

  button.mode {
    --size: 24px;
    border-radius: 999px;

    & :global(.icon) {
      margin-top: -0.0312rem;
    }

    &.active {
      background-color: oklch(from var(--color-accent) l c h / 10%);

      & :global(.icon) {
        color: var(--color-accent);
      }
    }
  }
</style>
