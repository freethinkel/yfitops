<script lang="ts">
  import { Cover } from "$lib/shared/components/cover";
  import { formatDuration } from "$lib/shared/helpers/date-time";
  import * as trackDnd from "$lib/shared/helpers/track-dnd";
  import { playerModel } from "../../model";
  import { playerMessages } from "$lib/modules/i18n";

  const t = playerMessages;
  const playerState = playerModel.$playerState;
  const queue = playerModel.$queue;
  const queueError = playerModel.$queueError;
  const dragging = trackDnd.$dragging;

  const current = $derived($playerState?.track_window.current_track);
  const next = $derived($queue ?? []);

  /** Index of the gap the pointer is over — where the track would land. */
  let dropIndex = $state<number | null>(null);
  /** Position being dragged within the queue, if the drag started here. */
  let movingIndex = $state<number | null>(null);

  const accepts = (event: DragEvent) =>
    movingIndex !== null || trackDnd.isTrackDrag(event);

  /** Above a row's midpoint means before it, below means after. */
  const gapAt = (event: DragEvent, index: number) => {
    const box = (event.currentTarget as HTMLElement).getBoundingClientRect();
    return event.clientY < box.top + box.height / 2 ? index : index + 1;
  };

  const onDrop = (event: DragEvent) => {
    const index = dropIndex;
    const from = movingIndex;
    dropIndex = null;
    movingIndex = null;

    if (index === null) return;

    if (from !== null) {
      if (from !== index && from + 1 !== index) playerModel.moveInQueue(from, index);
      return;
    }

    const track = trackDnd.droppedTrack(event);
    if (!track) return;

    // the dropped row already carries everything the queue shows
    playerModel.insertInQueue(
      {
        uri: track.uri,
        uid: "",
        name: track.name,
        artist: track.artists.map((artist) => artist.name).join(", "),
        image: track.album.images.at(-1)?.url ?? "",
        durationMs: track.duration_ms,
      },
      index,
    );
  };
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<aside
  class="queue"
  class:accepting={$dragging || movingIndex !== null}
  ondragover={(event) => {
    if (!accepts(event)) return;
    event.preventDefault();
    if (dropIndex === null) dropIndex = next.length;
  }}
  ondragleave={(event) => {
    if (event.currentTarget === event.target) dropIndex = null;
  }}
  ondrop={(event) => {
    event.preventDefault();
    onDrop(event);
  }}
>
  <h2>{$t.nowPlaying}</h2>
  {#if current}
    <div class="row current">
      <Cover url={current.album.images.at(-1)?.url} size={32} />
      <div class="meta">
        <div class="name">{current.name}</div>
        <div class="artists">
          {current.artists.map((artist) => artist.name).join(", ")}
        </div>
      </div>
    </div>
  {:else}
    <p class="empty">{$t.nothingPlaying}</p>
  {/if}

  <h2>{$t.nextUp}</h2>
  {#if next.length}
    <div class="list">
      {#each next as track, index (index)}
        <div
          class="row track"
          class:moving={movingIndex === index}
          class:gap_before={dropIndex === index}
          class:gap_after={dropIndex === index + 1 && index === next.length - 1}
          draggable="true"
          role="button"
          tabindex="0"
          onclick={() => playerModel.playFromQueue(track)}
          onkeydown={(event) =>
            event.key === "Enter" && playerModel.playFromQueue(track)}
          ondragstart={() => (movingIndex = index)}
          ondragend={() => {
            movingIndex = null;
            dropIndex = null;
          }}
          ondragover={(event) => {
            if (!accepts(event)) return;
            event.preventDefault();
            dropIndex = gapAt(event, index);
          }}
        >
          <Cover url={track.image} size={32} />
          <div class="meta">
            <div class="name">{track.name}</div>
            <div class="artists">{track.artist}</div>
          </div>
          <time>{formatDuration(track.durationMs)}</time>
          <button
            class="remove"
            type="button"
            aria-label={$t.removeFromQueue}
            onclick={(event) => {
              event.stopPropagation();
              playerModel.removeFromQueue(index);
            }}
          >
            ×
          </button>
        </div>
      {/each}
    </div>
  {:else if $queueError}
    <p class="empty error">{$queueError}</p>
  {:else}
    <p class="empty">{$t.queueEmpty}</p>
  {/if}
</aside>

<style>
  .queue {
    border: 1px dashed transparent;
    transition: var(--transition);

    &.accepting {
      border-color: oklch(from var(--color-text) l c h / 0.12);
    }

    --gutter: 0.625rem;

    display: flex;
    flex-direction: column;
    height: 100%;
    width: 100%;
    /* the padding lives on the sections, so the list's scrollbar sits at the
       panel's edge instead of floating inside a gutter */
    padding: var(--gutter) 0;
    overflow: hidden;
  }
  h2 {
    margin: 0.5rem 0 0.375rem;
    padding: 0 var(--gutter);
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: oklch(from var(--color-text) l c h / 0.6);
  }
  .list {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 0 var(--gutter);
    scrollbar-gutter: stable;
  }
  .row.track {
    cursor: pointer;

    &:hover {
      background: oklch(from var(--color-text) l c h / 0.04);
    }
  }
  .row {
    position: relative;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.25rem;
    border-radius: var(--border-radius);
    min-width: 0;

    &.current {
      margin: 0 var(--gutter);
      background: oklch(from var(--color-text) l c h / 0.04);
    }
    &.moving {
      opacity: 0.4;
    }

    /* the line marks the gap the track would drop into */
    &.gap_before::before,
    &.gap_after::after {
      content: "";
      position: absolute;
      left: 0.25rem;
      right: 0.25rem;
      height: 2px;
      border-radius: 2px;
      background: var(--color-accent);
    }
    &.gap_before::before {
      top: -1px;
    }
    &.gap_after::after {
      bottom: -1px;
    }
  }
  .remove {
    appearance: none;
    border: none;
    background: none;
    padding: 0 0.25rem;
    font-size: 0.94rem;
    line-height: 1;
    color: oklch(from var(--color-text) l c h / 0.6);
    cursor: pointer;
    opacity: 0;
    transition: var(--transition);

    &:hover {
      color: var(--color-text);
    }
  }
  .row:hover .remove {
    opacity: 1;
  }
  .meta {
    flex: 1;
    min-width: 0;
    line-height: 1.25;
  }
  .name,
  .artists {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .name {
    font-size: 0.8rem;
    font-weight: 500;
  }
  .artists {
    font-size: 0.7rem;
    color: oklch(from var(--color-text) l c h / 0.6);
  }
  time {
    font-size: 0.7rem;
    color: oklch(from var(--color-text) l c h / 0.6);
    font-variant-numeric: tabular-nums;
  }
  .error {
    color: var(--color-error);
  }
  .empty {
    margin: 0;
    font-size: 0.8rem;
    color: oklch(from var(--color-text) l c h / 0.6);
  }
</style>
