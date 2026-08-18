<script lang="ts">
  import { Icon } from "$lib/shared/components/icon";
  import { PlaylistButton } from "$lib/modules/playlist/components/playlist-button";
  import { playlistModel } from "$lib/modules/playlist/model";
  import { ProfileButton } from "$lib/modules/user/components/profile-button";
  import { SidebarButton } from "$lib/shared/components/sidebar-button";
  import { autoscroll } from "$lib/shared/helpers/autoscroll";
  import { droppedTrack, isTrackDrag } from "$lib/shared/helpers/track-dnd";

  const playlists = playlistModel.$playlists;
  const editable = playlistModel.$editablePlaylists;
  // dropping onto someone else's playlist is a 403, so those stay inert
  const editableIds = $derived(new Set($editable.map(({ id }) => id)));
</script>

<div class="wrapper">
  <div data-tauri-drag-region class="drag">
    <!-- ponytail: the webview owns no session history of its own, history does -->
    <button aria-label="Back" onclick={() => history.back()}>
      <Icon name="chevron-left" size={18} />
    </button>
    <button aria-label="Forward" onclick={() => history.forward()}>
      <Icon name="chevron-right" size={18} />
    </button>
  </div>

  <div class="top" use:autoscroll>
    <div class="pinned">
      <SidebarButton href="/app" icon="music">Home</SidebarButton>
      <SidebarButton href="/app/search" icon="search">Search</SidebarButton>
      <SidebarButton
        href="/app/liked"
        icon="heart"
        color="var(--color-error)"
        accepts={isTrackDrag}
        ondropitem={(event) => {
          const track = droppedTrack(event);
          if (track) playlistModel.addToLiked(track);
        }}>Liked songs</SidebarButton
      >
    </div>

    <div class="playlists">
      <div class="label">Playlists</div>
      {#each $playlists ?? [] as playlist (playlist.id)}
        <PlaylistButton {playlist} droppable={editableIds.has(playlist.id)} />
      {/each}
    </div>
  </div>

  <div class="bottom">
    <ProfileButton />
  </div>
</div>

<style>
  .label {
    font-size: 0.8rem;
    font-weight: bold;
    color: var(--color-text-60);
  }
  .wrapper {
    display: flex;
    flex-direction: column;
    height: 100%;
    width: 100%;
  }
  .top {
    padding: 10px;
    flex: 1;
    min-height: 0;
    width: 100%;
    display: flex;
    flex-direction: column;
    overflow: auto;
  }
  .bottom {
    padding: 10px;
    width: 100%;
  }
  .drag {
    height: 36px;
    width: 100%;
    display: flex;
    align-items: center;
    gap: 2px;
    /* clear of the traffic lights */
    padding-left: 76px;

    & button {
      appearance: none;
      border: none;
      background: none;
      border-radius: var(--border-radius);
      padding: 2px;
      display: flex;
      color: var(--color-text-60);
      cursor: default;

      &:hover {
        color: var(--color-text-100);
        background: var(--color-surface-10);
      }
    }
  }
  .pinned {
    padding-bottom: 12px;
  }
  .pinned,
  .playlists {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
</style>
