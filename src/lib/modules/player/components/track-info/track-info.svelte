<script lang="ts">
  import { appModel } from "$lib/modules/app/model";
  import { Cover } from "$lib/shared/components/cover";
  import { playerModel } from "../../model";

  const playerState = playerModel.$playerState;
  const track = $derived($playerState?.track_window.current_track);
</script>

<button class="cover" type="button" onclick={() => appModel.openDetails()}>
  <Cover size={44} url={track?.album.images[0]?.url} />
</button>

<div class="track_info">
  <div class="track_info__name">{track?.name ?? ""}</div>
  <div class="track_info__artists">
    {track?.artists.map((artist) => artist.name).join(", ") ?? ""}
  </div>
</div>

<style>
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
    padding-left: 10px;
    flex: 1;
    min-width: 0;

    &__name {
      font-size: 0.95rem;
      font-weight: 500;
      line-height: 1;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    &__artists {
      margin-top: 3px;
      font-size: 0.8rem;
      line-height: 1;
      color: var(--color-text-80);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
  }
</style>
