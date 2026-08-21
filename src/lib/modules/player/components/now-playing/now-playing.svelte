<script lang="ts">
  import { Lyrics } from "$lib/modules/lyrics/components/lyrics";
  import { Cover } from "$lib/shared/components/cover";
  import { formatDuration } from "$lib/shared/helpers/date-time";
  import { playerModel } from "../../model";
  import { playerMessages } from "$lib/modules/i18n";

  const t = playerMessages;
  const playerState = playerModel.$playerState;
  const track = $derived($playerState?.track_window.current_track);
</script>

<aside class="now_playing">
  <div class="cover">
    <Cover url={track?.album.images[0]?.url} size={240} fill />
  </div>

  <div class="meta">
    <div class="name">{track?.name ?? $t.nothingPlaying}</div>
    <div class="artists">
      {#each track?.artists ?? [] as artist, position (artist.uri + position)}
        {#if position > 0},
        {/if}
        {@const id = artist.uri.split(":")[2]}
        {#if id}
          <a href="/app/artist/{id}" draggable="false">{artist.name}</a>
        {:else}{artist.name}{/if}
      {/each}
    </div>

    {#if track}
      {@const albumId = track.album.uri.split(":")[2]}
      <dl class="details">
        <dt>{$t.album}</dt>
        <dd>
          {#if albumId}
            <a href="/app/album/{albumId}" draggable="false"
              >{track.album.name}</a
            >
          {:else}{track.album.name}{/if}
        </dd>
        <dt>{$t.duration}</dt>
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
    --gutter: 10px;

    display: flex;
    flex-direction: column;
    height: 100%;
    width: 100%;
    overflow: hidden;
  }
  /* the padding lives on the sections, so the lyrics scrollbar sits at the
     panel's edge instead of floating inside a gutter */
  .cover {
    display: flex;
    justify-content: flex-start;
    /* the panel is a column flex: without this the square gets squashed
       vertically whenever the lyrics need the room */
    align-items: flex-start;
    flex-shrink: 0;
    padding: var(--gutter);

    & :global(.cover) {
      box-shadow: var(--shadow-1);
    }
  }
  .meta {
    display: flex;
    flex-direction: column;
    min-width: 0;
    padding: 0 var(--gutter);
  }
  .name {
    font-size: 1.03rem;
    font-weight: 600;
    line-height: 1.2;
  }
  .artists {
    margin-top: 0.125rem;
    font-size: 0.84rem;
    color: oklch(from var(--color-text) l c h / 0.8);

    & a {
      color: inherit;
      text-decoration: none;

      &:hover {
        color: var(--color-text);
        text-decoration: underline;
      }
    }
  }
  .details {
    display: grid;
    /* max-content, not auto: a long label like “Длительность” must keep its
       width and let the value truncate instead of being squeezed itself */
    grid-template-columns: max-content 1fr;
    gap: 0.125rem 0.625rem;
    margin: 0.625rem 0 0;
    font-size: 0.8rem;

    & dt {
      color: oklch(from var(--color-text) l c h / 0.6);
      white-space: nowrap;
    }
    & dd {
      margin: 0;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;

      & a {
        color: inherit;
        text-decoration: none;

        &:hover {
          color: var(--color-text);
          text-decoration: underline;
        }
      }
    }
  }
  .lyrics {
    flex: 1;
    min-height: 0;
    display: flex;
    margin-top: 0.75rem;
    border-top: 1px solid oklch(from var(--color-text) l c h / 0.12);

    & :global(.lyrics) {
      flex: 1;
      padding: var(--gutter);
      scrollbar-gutter: stable;
    }
  }
</style>
