<script lang="ts">
  import { afterNavigate } from "$app/navigation";
  import { Icon } from "$lib/shared/components/icon";
  import { PlaylistButton } from "$lib/modules/playlist/components/playlist-button";
  import { playlistModel } from "$lib/modules/playlist/model";
  import { ProfileButton } from "$lib/modules/user/components/profile-button";
  import { SidebarButton } from "$lib/shared/components/sidebar-button";
  import { autoscroll } from "$lib/shared/helpers/autoscroll";
  import { droppedTrack, isTrackDrag } from "$lib/shared/helpers/track-dnd";
  import { sidebarMessages } from "$lib/modules/i18n";

  const t = sidebarMessages;
  const playlists = playlistModel.$playlists;
  const editable = playlistModel.$editablePlaylists;
  // dropping onto someone else's playlist is a 403, so those stay inert
  const editableIds = $derived(new Set($editable.map(({ id }) => id)));

  /**
   * The History API never tells whether there is anywhere to go, so the
   * position is tracked by hand: a new navigation truncates whatever was
   * ahead, popstate reports how far it jumped.
   */
  let position = $state(0);
  let furthest = $state(0);

  afterNavigate((navigation) => {
    if (navigation.type === "enter") return;

    if (navigation.type === "popstate") {
      position += navigation.delta ?? 0;
    } else {
      position += 1;
      furthest = position;
    }
  });
</script>

<div class="wrapper">
  <div data-tauri-drag-region class="drag">
    <div class="history-buttons">
      <button
        aria-label={$t.back}
        disabled={position <= 0}
        onclick={() => history.back()}
      >
        <Icon name="chevron-left" size={22} />
      </button>
      <button
        aria-label={$t.forward}
        disabled={position >= furthest}
        onclick={() => history.forward()}
      >
        <Icon name="chevron-right" size={22} />
      </button>
    </div>
  </div>

  <div class="top" use:autoscroll>
    <div class="pinned">
      <SidebarButton href="/app" icon="home">{$t.home}</SidebarButton>
      <SidebarButton href="/app/search" icon="search">{$t.search}</SidebarButton>
      <SidebarButton
        href="/app/liked"
        icon="heart"
        color="var(--color-error)"
        accepts={isTrackDrag}
        ondropitem={(event) => {
          const track = droppedTrack(event);
          if (track) playlistModel.addToLiked(track);
        }}>{$t.likedSongs}</SidebarButton
      >
    </div>

    <div class="playlists">
      <div class="label">{$t.playlists}</div>
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
  .history-buttons {
    margin-left: 0.5rem;
    display: flex;
    align-items: center;
    padding: 0.188rem;

    @supports (-apple-visual-effect: -apple-system-glass-material) {
      background: transparent;
      -apple-visual-effect: -apple-system-glass-material-media-controls;
      border-radius: 999px;

      :global(body:not(.window__focused)) & {
        -apple-visual-effect: -apple-system-glass-material-media-controls-subdued;
      }
    }

    & button {
      height: 1.688rem;
      width: 1.688rem;
      display: flex;
      align-items: center;
      justify-content: center;
      appearance: none;
      border: none;
      background: none;
      border-radius: 999px;
      padding: 0.094rem;
      display: flex;
      color: oklch(from var(--color-text) l c h / 0.6);
      cursor: default;

      &:hover:not(:disabled) {
        color: var(--color-text);
        background: oklch(from var(--color-text) l c h / 0.04);
      }

      &:disabled {
        opacity: 0.35;
      }
    }
  }
  .label {
    font-size: 0.75rem;
    font-weight: bold;
    color: oklch(from var(--color-text) l c h / 0.6);
  }
  .wrapper {
    display: flex;
    flex-direction: column;
    height: 100%;
    width: 100%;
  }
  .top {
    padding: 0 0.625rem 0.625rem;
    flex: 1;
    min-height: 0;
    width: 100%;
    display: flex;
    flex-direction: column;
    overflow: auto;
  }
  .bottom {
    padding: 0.625rem;
    width: 100%;
  }
  .drag {
    height: 50px;
    width: 100%;
    display: flex;
    align-items: center;
    gap: 0.125rem;
    padding-left: 5rem;
  }
  .pinned {
    padding-bottom: 0.75rem;
  }
  .pinned,
  .playlists {
    display: flex;
    flex-direction: column;
    gap: 0.1875rem;
  }
</style>
