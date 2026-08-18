<script lang="ts">
  import { Lyrics } from "$lib/modules/lyrics/components/lyrics";
  import { Cover } from "$lib/shared/components/cover";
  import { formatDuration } from "$lib/shared/helpers/date-time";
  import { playerModel } from "../../model";

  const playerState = playerModel.$playerState;
  const track = $derived($playerState?.track_window.current_track);
</script>

<aside class="now_playing">
  <div class="cover">
    <Cover url={track?.album.images[0]?.url} size={240} />
  </div>

  <div class="meta">
    <div class="name">{track?.name ?? "Nothing playing"}</div>
    <div class="artists">
      {track?.artists.map((artist) => artist.name).join(", ") ?? ""}
    </div>

    {#if track}
      <dl class="details">
        <dt>Album</dt>
        <dd>{track.album.name}</dd>
        <dt>Duration</dt>
        <dd>{formatDuration(track.duration_ms)}</dd>
      </dl>
    {/if}
  </div>

  <div class="lyrics">
    <Lyrics />
  </div>
</aside>

<style>
  .now_playing {
    display: flex;
    flex-direction: column;
    height: 100%;
    width: 100%;
    padding: 10px;
    gap: 12px;
    overflow: hidden;
  }
  .cover {
    display: flex;
    justify-content: center;

    & :global(.cover) {
      box-shadow: var(--shadow-1);
    }
  }
  .meta {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .name {
    font-size: 1.1rem;
    font-weight: 600;
    line-height: 1.2;
  }
  .artists {
    margin-top: 2px;
    font-size: 0.9rem;
    color: var(--color-text-80);
  }
  .details {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 2px 10px;
    margin: 10px 0 0;
    font-size: 0.85rem;

    & dt {
      color: var(--color-text-60);
    }
    & dd {
      margin: 0;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  }
  .lyrics {
    flex: 1;
    min-height: 0;
    display: flex;
    border-top: 1px solid var(--color-surface-20);
    padding-top: 10px;

    & :global(.lyrics) {
      flex: 1;
    }
  }
</style>
