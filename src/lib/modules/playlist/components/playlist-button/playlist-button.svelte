<script lang="ts">
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import { Icon } from "$lib/shared/components/icon";
  import {
    IconMenuItem,
    Menu,
    NativeIcon,
    PredefinedMenuItem,
  } from "@tauri-apps/api/menu";
  import { playerModel } from "$lib/modules/player/model";
  import * as trackDnd from "$lib/shared/helpers/track-dnd";
  import { playlistModel } from "../../model";

  interface Props {
    playlist: SpotifyApi.PlaylistObjectSimplified;
    droppable?: boolean;
  }
  const { playlist, droppable = false }: Props = $props();

  const href = $derived(`/app/playlist/${playlist.id}`);

  let over = $state(false);
  const dragging = trackDnd.$dragging;

  const openMenu = async (event: MouseEvent) => {
    if (!("__TAURI_INTERNALS__" in window)) return;
    event.preventDefault();

    const menu = await Menu.new({
      items: await Promise.all([
        IconMenuItem.new({
          text: "Играть",
          icon: NativeIcon.RightFacingTriangle,
          action: () => playerModel.playContext(playlist.uri),
        }),
        IconMenuItem.new({
          text: "Открыть",
          icon: NativeIcon.Folder,
          action: () => goto(href),
        }),
        PredefinedMenuItem.new({ item: "Separator" }),
        IconMenuItem.new({
          text: "Копировать ссылку",
          icon: NativeIcon.FollowLinkFreestanding,
          action: () =>
            navigator.clipboard.writeText(playlist.external_urls.spotify),
        }),
        IconMenuItem.new({
          text: "Убрать из библиотеки",
          icon: NativeIcon.Remove,
          action: () => playlistModel.unfollowPlaylist(playlist.id),
        }),
      ]),
    });

    await menu.popup();
  };

  const drop = (event: DragEvent) => {
    over = false;
    const track = trackDnd.droppedTrack(event);
    if (track) playlistModel.addToPlaylist(playlist.id, track.uri);
  };
</script>

<a
  {href}
  class="playlist_btn"
  class:active={page.url.pathname === href}
  class:over
  class:inert={$dragging && !droppable}
  ondragover={(event) => {
    if (!droppable || !trackDnd.isTrackDrag(event)) return;
    event.preventDefault();
    over = true;
  }}
  ondragleave={() => (over = false)}
  ondrop={drop}
  oncontextmenu={openMenu}
>
  <div class="cover">
    {#if playlist.images?.[0]?.url}
      <img src={playlist.images[0].url} alt="" />
    {/if}
    <Icon name="playlist" size={18} />
  </div>
  <div class="inner">{playlist.name}</div>
</a>

<style>
  .playlist_btn {
    appearance: none;
    color: var(--color-text-100);
    display: flex;
    align-items: center;
    gap: 6px;
    text-decoration: none;
    background: transparent;
    border-radius: var(--border-radius);
    height: 28px;
    padding: 0 6px;
    font-size: 0.9rem;

    &:hover,
    &.active {
      background: var(--color-surface-10);
    }
    &.over {
      background: var(--color-accent-20);
    }
    /* not mine — nothing to drop here */
    &.inert {
      opacity: 0.4;
    }
  }
  .cover {
    --size: 22px;
    height: var(--size);
    width: var(--size);
    position: relative;
    border-radius: 2px;
    overflow: hidden;
    background: var(--color-surface-10);

    & :global(.icon) {
      position: absolute;
      display: flex;
      align-items: center;
      justify-content: center;
      inset: 0;
      z-index: 0;
    }

    & img {
      position: absolute;
      inset: 0;
      height: 100%;
      width: 100%;
      object-fit: cover;
      z-index: 1;
    }
  }
  .inner {
    flex: 1;
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
</style>
