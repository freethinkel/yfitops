<script lang="ts">
  import { Cover } from "$lib/shared/components/cover";
  import { Icon } from "$lib/shared/components/icon";
  import { Marquee } from "$lib/shared/components/marquee";
  import { miniModel, playerModel } from "../../model";
  import { libraryMessages } from "$lib/modules/i18n";

  const t = libraryMessages;
  const playerState = playerModel.$playerState;
  const liked = playerModel.$currentLiked;
  const track = $derived($playerState?.track_window.current_track);
</script>

<div class="wrapper track_info__root">
  <button
    class="cover"
    type="button"
    aria-label="Open the mini player"
    onclick={() => miniModel.openMini()}
  >
    <Cover size={44} url={track?.album.images[0]?.url} />
    <span class="detach"><Icon name="mini-player" size={18} /></span>
  </button>

  <div class="track_info">
    <div class="track_info__name">
      <Marquee text={track?.name ?? ""} />
    </div>
    <div class="track_info__artists">
      <Marquee
        text={track?.artists.map((artist) => artist.name).join(", ") ?? ""}
      >
        {#each track?.artists ?? [] as artist, position (artist.uri + position)}
          {#if position > 0},
          {/if}
          {@const id = artist.uri.split(":")[2]}
          {#if id}
            <a href="/app/artist/{id}" draggable="false">{artist.name}</a>
          {:else}{artist.name}{/if}
        {/each}
      </Marquee>
    </div>
  </div>

  {#if track}
    <button
      class="like"
      class:active={$liked}
      type="button"
      title={$liked ? $t.unlike : $t.like}
      aria-pressed={$liked}
      onclick={() => playerModel.toggleCurrentLike()}
    >
      <Icon name={$liked ? "heart" : "heart-outline"} size={15} />
    </button>
  {/if}
</div>

<style>
  .wrapper {
    display: flex;
    align-items: flex-start;
    gap: 0.469rem;
    /* .center is a column with align-items: flex-start, so a child is sized by
       its own content — the title has to be told to take the column's width */
    width: 100%;
    min-width: 0;
  }
  /* the whole artwork is the target, the way the mini player opens in Apple
     Music — the glyph only says so on hover */
  .cover {
    position: relative;
    appearance: none;
    border: none;
    background: none;
    padding: 0;
    display: flex;
    cursor: pointer;

    &:hover .detach {
      opacity: 1;
    }
  }
  .detach {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--border-radius);
    background: rgba(0, 0, 0, 0.45);
    color: #fff;
    opacity: 0;
    transition: var(--transition);
  }
  .like {
    appearance: none;
    border: none;
    background: none;
    padding: 0.25rem;
    display: flex;
    align-items: center;
    cursor: pointer;
    color: oklch(from var(--color-text) l c h / 0.6);
    transition: var(--transition);

    &:hover {
      color: var(--color-text);
    }
    &.active {
      color: var(--color-accent);
    }
  }
  .track_info {
    display: flex;
    flex-direction: column;
    justify-content: flex-start;
    flex: 1;
    min-width: 0;

    &__name {
      font-size: 0.89rem;
      font-weight: 500;
      line-height: 1;
      white-space: nowrap;
      overflow: hidden;
    }
    &__artists {
      margin-top: 0.281rem;
      font-size: 0.75rem;
      line-height: 1;
      color: oklch(from var(--color-text) l c h / 0.8);
      white-space: nowrap;
      overflow: hidden;

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
</style>
