<script lang="ts">
  import { Cover } from "$lib/shared/components/cover";
  import { Icon } from "$lib/shared/components/icon";
  import { formatDuration } from "$lib/shared/helpers/date-time";
  import { startTrackDrag } from "$lib/shared/helpers/track-dnd";

  interface Props {
    track: SpotifyApi.TrackObjectFull;
    index: number;
    liked?: boolean;
    /** The row the keyboard is on. */
    selected?: boolean;
    playing?: boolean;
    onplay?: () => void;
    onselect?: () => void;
    onlike?: () => void;
    onmenu?: (event: MouseEvent) => void;
  }
  const {
    track,
    index,
    liked = false,
    selected = false,
    playing = false,
    onplay,
    onselect,
    onlike,
    onmenu,
  }: Props = $props();

  // the row itself starts playback — a link inside it must not
  const stopPlay = (event: MouseEvent) => event.stopPropagation();
</script>

<!-- keyboard handling lives in the list: Enter there dispatches this click -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<div
  class="row"
  class:playing
  class:selected
  class:odd={index % 2 === 1}
  role="row"
  tabindex="-1"
  draggable="true"
  ondragstart={(event) => startTrackDrag(event, track)}
  onclick={() => {
    onselect?.();
    onplay?.();
  }}
  oncontextmenu={(event) => {
    onselect?.();
    onmenu?.(event);
  }}
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
    <Icon name={liked ? "heart" : "heart-outline"} size={13} />
  </button>

  <span class="cell cover" role="gridcell">
    <Cover url={track.album.images.at(-1)?.url} size={20} />
  </span>
  <span class="cell title" role="gridcell">{track.name}</span>
  <span class="cell muted" role="gridcell">
    {#if track.album.id}
      <a
        href="/app/album/{track.album.id}"
        draggable="false"
        onclick={stopPlay}
      >
        {track.album.name}
      </a>
    {:else}
      {track.album.name}
    {/if}
  </span>
  <span class="cell muted" role="gridcell">
    {#each track.artists as artist, position (artist.id + position)}
      {#if position > 0},
      {/if}
      <a href="/app/artist/{artist.id}" draggable="false" onclick={stopPlay}
        >{artist.name}</a
      >
    {/each}
  </span>
  <span class="cell time" role="gridcell"
    >{formatDuration(track.duration_ms)}</span
  >
</div>

<style>
  .row:focus,
  .row button:focus {
    outline: none;
  }
  .row {
    display: grid;
    grid-template-columns: var(--track-columns);
    align-items: center;
    height: 24px;
    font-size: 0.75rem;
    line-height: 1;
    color: var(--color-text);
    cursor: default;

    &.odd {
      background: oklch(from var(--color-text) l c h / 0.04);
    }
    &:hover {
      background: oklch(from var(--color-text) l c h / 0.12);
    }
    /* the keyboard cursor is a fainter version of the playing highlight */
    &.selected {
      background: oklch(from var(--color-accent) l c h / 0.1);
    }
    &.playing {
      background: oklch(from var(--color-accent) l c h / 0.2);
    }
  }
  .cell {
    padding: 0 0.375rem;
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .muted {
    color: oklch(from var(--color-text) l c h / 0.6);

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
    color: oklch(from var(--color-text) l c h / 0.6);
    font-variant-numeric: tabular-nums;
  }
  .index {
    display: flex;
    justify-content: flex-end;

    color: var(--color-text);
  }
  .cover {
    display: flex;
    --border-radius: 4.5px;
  }
  .like {
    display: flex;
    appearance: none;
    background: none;
    border: none;
    padding: 0 0.3125rem;
    cursor: pointer;

    color: oklch(from var(--color-text) l c h / 0.6);

    &.active {
      color: var(--color-accent);
    }
  }
</style>
