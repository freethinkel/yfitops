<script lang="ts">
  import { appModel } from "$lib/modules/app/model";
  import { Cover } from "$lib/shared/components/cover";
  import { Marquee } from "$lib/shared/components/marquee";
  import { playerModel } from "../../model";

  const playerState = playerModel.$playerState;
  const track = $derived($playerState?.track_window.current_track);
</script>

<div class="wrapper track_info__root">
  <button class="cover" type="button" onclick={() => appModel.openDetails()}>
    <Cover size={44} url={track?.album.images[0]?.url} />
  </button>

  <div class="track_info">
    <div class="track_info__name">
      <Marquee text={track?.name ?? ""} />
    </div>
    <div class="track_info__artists">
      <Marquee
        text={track?.artists.map((artist) => artist.name).join(", ") ?? ""}
      />
    </div>
  </div>
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
  .cover {
    appearance: none;
    border: none;
    background: none;
    padding: 0;
    display: flex;
    cursor: pointer;
    transition: var(--transition);

    &:hover {
      opacity: 0.8;
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
    }
  }
</style>
