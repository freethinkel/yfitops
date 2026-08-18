<script lang="ts">
  import { Slider } from "$lib/shared/components/slider";
  import { formatDuration } from "$lib/shared/helpers/date-time";
  import { playerModel } from "../../model";

  interface Props {
    thumbBorderColor?: string;
  }
  const { thumbBorderColor }: Props = $props();

  const playerState = playerModel.$playerState;
  let isDragging = $state(false);

  const duration = $derived($playerState?.duration ?? 0);
  const position = $derived($playerState?.position ?? 0);
</script>

<div class="slider__wrapper" class:dragging={isDragging}>
  <time class="time">{formatDuration(position)}</time>
  <div class="slider">
    <Slider
      value={duration ? position / duration : 0}
      {thumbBorderColor}
      onchange={(value) => playerModel.seek(value * duration)}
      ondragging={(dragging) => (isDragging = dragging)}
    />
  </div>
  <time class="time">{formatDuration(duration)}</time>
</div>

<style>
  .slider {
    padding: 0 6px;
    width: 100%;

    &__wrapper {
      display: flex;
      align-items: center;
      width: 100%;

      &:hover .time,
      &.dragging .time {
        opacity: 1;
      }

      & .time {
        transition: var(--transition);
        opacity: 0;
        min-width: 50px;
      }
    }
  }
  .time {
    color: var(--color-text-80);
    font-size: 0.85rem;
    font-weight: 600;

    &:first-of-type {
      text-align: right;
    }
  }
</style>
