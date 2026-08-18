<script lang="ts">
  import { Cover } from "$lib/shared/components/cover";
  import { Icon } from "$lib/shared/components/icon";
  import { formatDuration } from "$lib/shared/helpers/date-time";
  import { startTrackDrag } from "$lib/shared/helpers/track-dnd";

  interface Props {
    track: SpotifyApi.TrackObjectFull;
    index: number;
    liked?: boolean;
    playing?: boolean;
    onplay?: () => void;
    onlike?: () => void;
    onmenu?: (event: MouseEvent) => void;
  }
  const {
    track,
    index,
    liked = false,
    playing = false,
    onplay,
    onlike,
    onmenu,
  }: Props = $props();

  // the row itself starts playback — a link inside it must not
  const stopPlay = (event: MouseEvent) => event.stopPropagation();
</script>

<div
  class="row"
  class:playing
  class:odd={index % 2 === 1}
  role="row"
  tabindex="0"
  draggable="true"
  ondragstart={(event) => startTrackDrag(event, track)}
  onclick={onplay}
  oncontextmenu={onmenu}
  onkeydown={(event) => event.key === "Enter" && onplay?.()}
>
  <span class="cell index" role="gridcell">
    {#if playing}
      <Icon name="play" size={11} />
    {:else}
      {index + 1}
    {/if}
  </span>

  <button
    class="cell like"
    class:active={liked}
    type="button"
    title={liked ? "Удалить из любимых" : "Добавить в любимые"}
    onclick={(event) => {
      event.stopPropagation();
      onlike?.();
    }}
  >
    <Icon name="heart" size={13} />
  </button>

  <span class="cell cover" role="gridcell">
    <Cover url={track.album.images.at(-1)?.url} size={16} />
  </span>
  <span class="cell title" role="gridcell">{track.name}</span>
  <span class="cell muted" role="gridcell">
    {#if track.album.id}
      <a href="/app/album/{track.album.id}" draggable="false" onclick={stopPlay}>
        {track.album.name}
      </a>
    {:else}
      {track.album.name}
    {/if}
  </span>
  <span class="cell muted" role="gridcell">
    {#each track.artists as artist, position (artist.id + position)}
      {#if position > 0}, {/if}
      <a href="/app/artist/{artist.id}" draggable="false" onclick={stopPlay}>{artist.name}</a>
    {/each}
  </span>
  <span class="cell time" role="gridcell">{formatDuration(track.duration_ms)}</span>
</div>

<style>
  .row {
    display: grid;
    grid-template-columns: var(--track-columns);
    align-items: center;
    height: 24px;
    font-size: 0.8rem;
    line-height: 1;
    color: var(--color-text-100);
    cursor: default;

    &.odd {
      background: var(--color-surface-10);
    }
    &:hover {
      background: var(--color-surface-20);
    }
    &.playing {
      background: var(--color-accent-20);
    }
  }
  .cell {
    padding: 0 6px;
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .muted {
    color: var(--color-text-60);

    & a {
      color: inherit;
      text-decoration: none;

      &:hover {
        text-decoration: underline;
      }
    }
  }
  .index,
  .time {
    text-align: right;
    color: var(--color-text-60);
    font-variant-numeric: tabular-nums;
  }
  .index {
    display: flex;
    justify-content: flex-end;

    color: var(--color-text-100);
  }
  .cover {
    display: flex;
  }
  .like {
    display: flex;
    appearance: none;
    background: none;
    border: none;
    padding: 0 5px;
    cursor: pointer;

    color: var(--color-text-60);

    &.active {
      color: var(--color-accent-100);
    }
  }
</style>
