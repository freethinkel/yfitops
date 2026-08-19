<script lang="ts">
  import { Slider } from "$lib/shared/components/slider";
  import { formatDuration } from "$lib/shared/helpers/date-time";
  import { playerModel } from "../../model";

  const playerState = playerModel.$playerState;
  const position = playerModel.$position;
  let isDragging = $state(false);

  const duration = $derived($playerState?.duration ?? 0);
</script>

<div class="slider__wrapper progress__root" class:dragging={isDragging}>
  <time class="time">{formatDuration($position)}</time>
  <div class="slider">
    <Slider
      value={duration ? $position / duration : 0}
      onchange={(value) => playerModel.seek(value * duration)}
      ondragging={(dragging) => (isDragging = dragging)}
    />
  </div>
  <time class="time">{formatDuration(duration)}</time>
</div>

<style>
  .slider {
    padding: 0;
    width: 100%;
    transition: transform var(--spring-transition);

    &__wrapper {
      display: flex;
      align-items: center;
      width: 100%;
      position: relative;
      height: 0.281rem;

      &:hover {
        & .slider {
          transform: translateY(-6px);
        }
        & :global(.track) {
          height: 0.15rem;
        }
      }

      &:hover .time,
      &.dragging .time {
        opacity: 1;
        transform: translateY(-6px);
      }

      & .time {
        opacity: 0;
        min-width: 50px;
        position: absolute;
        bottom: 0.125rem;

        &:first-child {
          left: 0;
        }
        &:last-child {
          right: 0;
        }
      }
    }
  }
  .time {
    color: oklch(from var(--color-text) l c h / 0.8);
    font-size: 0.66rem;
    font-weight: 600;
    transition:
      transform var(--spring-transition),
      opacity var(--spring-transition);

    &:last-child {
      text-align: right;
    }
  }
</style>
