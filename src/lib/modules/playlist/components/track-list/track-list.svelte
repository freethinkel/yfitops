<script lang="ts">
  import { goto } from "$app/navigation";
  import {
    IconMenuItem,
    Menu,
    MenuItem,
    NativeIcon,
    PredefinedMenuItem,
    Submenu,
  } from "@tauri-apps/api/menu";
  import { playerModel } from "$lib/modules/player/model";
  import { Icon } from "$lib/shared/components/icon";
  import { Skeleton } from "$lib/shared/components/skeleton";
  import { menuIcon } from "$lib/shared/helpers/menu-icon";
  import { playlistModel } from "../../model";
  import Track from "../track/track.svelte";

  interface Props {
    /** undefined while loading — the table then draws itself as skeletons */
    tracks?: readonly SpotifyApi.TrackObjectFull[];
    /** Set on a playlist page the user may edit — enables "remove from it". */
    removeFrom?: string;
  }
  const { tracks, removeFrom }: Props = $props();

  const loading = $derived(!tracks);

  type Column = {
    title: string;
    sort?: (track: SpotifyApi.TrackObjectFull) => string | number;
  };

  const COLUMNS: Column[] = [
    { title: "#" },
    { title: "" },
    { title: "" },
    { title: "Трек", sort: (track) => track.name.toLowerCase() },
    { title: "Альбом", sort: (track) => track.album.name.toLowerCase() },
    { title: "Артист", sort: (track) => track.artists[0]?.name.toLowerCase() ?? "" },
    { title: "Время", sort: (track) => track.duration_ms },
  ];

  // ponytail: asc → desc → original order, same cycle as the Flutter table
  let sort = $state<{ column: number; desc: boolean } | null>(null);

  const toggleSort = (index: number) => {
    if (sort?.column !== index) return (sort = { column: index, desc: false });
    sort = sort.desc ? null : { column: index, desc: true };
  };

  const sorted = $derived.by(() => {
    if (!sort) return tracks ?? [];
    const value = COLUMNS[sort.column].sort!;
    return [...(tracks ?? [])].sort((a, b) => {
      const diff = value(a) > value(b) ? 1 : value(a) < value(b) ? -1 : 0;
      return sort!.desc ? -diff : diff;
    });
  });

  const editablePlaylists = playlistModel.$editablePlaylists;

  const likedSongs = playlistModel.$likedSongs;
  const likedIds = $derived(
    new Set($likedSongs?.map((item) => item.track.id) ?? []),
  );

  const playerState = playerModel.$playerState;
  const currentId = $derived($playerState?.track_window.current_track.id);

  // ponytail: selection is state, not DOM focus — WebKit does not focus a
  // clicked div, so relying on focus meant having to Tab into the list first
  let selected = $state<number | null>(null);
  let body = $state<HTMLDivElement>();

  const playingIndex = $derived(sorted.findIndex(({ id }) => id === currentId));

  const select = (index: number) => {
    selected = Math.max(0, Math.min(index, sorted.length - 1));
    body?.children[selected]?.scrollIntoView({ block: "nearest" });
  };

  const onKeydown = (event: KeyboardEvent) => {
    const target = event.target as HTMLElement | null;
    if (target?.closest("input, textarea, [contenteditable]")) return;
    if (!sorted.length) return;

    // nothing picked yet: start from the playing track, otherwise from the top
    const from = selected ?? (playingIndex >= 0 ? playingIndex : 0);

    const next = {
      ArrowDown: from + (selected === null ? 0 : 1),
      ArrowUp: from - (selected === null ? 0 : 1),
      Home: 0,
      End: sorted.length - 1,
      PageDown: from + 10,
      PageUp: from - 10,
    }[event.key];

    if (next !== undefined) {
      event.preventDefault();
      return select(next);
    }

    if (selected === null) return;
    const track = sorted[selected];

    // the row itself knows what a click means — no need to repeat it here
    if (event.key === "Enter") {
      (body?.children[selected] as HTMLElement | undefined)?.click();
    }
    if (event.key === "l") playlistModel.toggleLike(track);
  };

  const openMenu = async (event: MouseEvent, index: number) => {
    // outside the webview the browser's own menu is the better answer
    if (!("__TAURI_INTERNALS__" in window)) return;
    event.preventDefault();

    const track = sorted[index];
    const liked = likedIds.has(track.id);

    // ponytail: AppKit's own template images — no assets, no rasterizing
    const menu = await Menu.new({
      items: await Promise.all([
        IconMenuItem.new({
          text: "Играть",
          icon: NativeIcon.RightFacingTriangle,
          action: () =>
            playerModel.play(sorted.slice(index).map(({ uri }) => uri)),
        }),
        IconMenuItem.new({
          text: liked ? "Удалить из любимых" : "Добавить в любимые",
          icon: liked ? NativeIcon.Remove : NativeIcon.Add,
          action: () => playlistModel.toggleLike(track),
        }),
        Submenu.new({
          text: "Добавить в плейлист",
          enabled: $editablePlaylists.length > 0,
          items: await Promise.all(
            $editablePlaylists.map(async (playlist) => {
              const icon = await menuIcon(playlist.images?.[0]?.url ?? "");
              const options = {
                text: playlist.name,
                action: () => playlistModel.addToPlaylist(playlist.id, track.uri),
              };

              return icon
                ? IconMenuItem.new({ ...options, icon })
                : MenuItem.new(options);
            }),
          ),
        }),
        IconMenuItem.new({
          text: "В очередь",
          icon: NativeIcon.ListView,
          action: () => playerModel.addToQueue(track.uri),
        }),
        ...(removeFrom
          ? [
              IconMenuItem.new({
                text: "Удалить из плейлиста",
                icon: NativeIcon.Remove,
                action: () => playlistModel.removeFromPlaylist(removeFrom, track.uri),
              }),
            ]
          : []),
        PredefinedMenuItem.new({ item: "Separator" }),
        IconMenuItem.new({
          text: "Перейти к альбому",
          icon: NativeIcon.Folder,
          enabled: !!track.album.id,
          action: () => goto(`/app/album/${track.album.id}`),
        }),
        IconMenuItem.new({
          text: "Перейти к артисту",
          icon: NativeIcon.User,
          enabled: !!track.artists[0]?.id,
          action: () => goto(`/app/artist/${track.artists[0].id}`),
        }),
        PredefinedMenuItem.new({ item: "Separator" }),
        IconMenuItem.new({
          text: "Копировать ссылку",
          icon: NativeIcon.FollowLinkFreestanding,
          action: () =>
            navigator.clipboard.writeText(track.external_urls.spotify),
        }),
      ]),
    });

    await menu.popup();
  };
</script>

<svelte:window onkeydown={onKeydown} />

<div class="table">
  <div class="head">
    {#each COLUMNS as column, index (column.title + index)}
      <button
        class="cell"
        class:sortable={column.sort}
        type="button"
        disabled={!column.sort}
        onclick={() => toggleSort(index)}
      >
        {column.title}
        {#if sort?.column === index}
          <Icon name={sort.desc ? "chevron-down" : "chevron-up"} size={12} />
        {:else if column.sort}
          <!-- the direction a click would sort by, greyed until then -->
          <span class="preview"><Icon name="chevron-up" size={12} /></span>
        {/if}
      </button>
    {/each}
  </div>

  <div class="body" role="rowgroup" bind:this={body}>
    {#if loading}
      {#each Array(24) as _, index (index)}
        <div class="row skeleton_row" class:odd={index % 2 === 1}>
          <span class="cell"></span>
          <span class="cell"></span>
          <span class="cell"><Skeleton width="1.25rem" height="1.25rem" /></span>
          <span class="cell"><Skeleton width="60%" height="0.625rem" /></span>
          <span class="cell"><Skeleton width="45%" height="0.625rem" /></span>
          <span class="cell"><Skeleton width="50%" height="0.625rem" /></span>
          <span class="cell"><Skeleton width="2rem" height="0.625rem" /></span>
        </div>
      {/each}
    {/if}

    {#each sorted as track, index (track.id + index)}
      <Track
        {track}
        {index}
        liked={likedIds.has(track.id)}
        playing={track.id === currentId}
        selected={index === selected}
        onselect={() => (selected = index)}
        onplay={() => playerModel.play(sorted.slice(index).map(({ uri }) => uri))}
        onlike={() => playlistModel.toggleLike(track)}
        onmenu={(event) => openMenu(event, index)}
      />
    {/each}
  </div>
</div>

<style>
  .table {
    --track-columns: 34px 24px 26px minmax(120px, 3fr) minmax(80px, 2fr) minmax(80px, 2fr) 56px;
    font-variant-numeric: tabular-nums;
  }
  .head {
    display: grid;
    grid-template-columns: var(--track-columns);
    position: sticky;
    top: 0;
    z-index: 1;
    height: 24px;
    background: oklch(from var(--color-text) l c h / 0.12);
    backdrop-filter: blur(10px);
    border-bottom: 1px solid oklch(from var(--color-text) l c h / 0.12);
  }
  .cell {
    display: flex;
    align-items: center;
    gap: 0.125rem;
    appearance: none;
    background: none;
    border: none;
    padding: 0 0.375rem;
    min-width: 0;
    font-family: inherit;
    font-size: 0.7rem;
    font-weight: 600;
    color: oklch(from var(--color-text) l c h / 0.6);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  /* the same grid as a real row, so the columns line up while loading */
  .skeleton_row {
    display: grid;
    grid-template-columns: var(--track-columns);
    align-items: center;
    height: 24px;

    &.odd {
      background: oklch(from var(--color-text) l c h / 0.04);
    }

    & .cell {
      display: flex;
      align-items: center;
      padding: 0 0.375rem;
    }
  }
  .cell:first-child {
    justify-content: flex-end;
  }
  .cell:last-child {
    justify-content: flex-end;
  }
  .preview {
    display: flex;
    opacity: 0;
    color: oklch(from var(--color-text) l c h / 0.4);
  }
  .sortable:hover .preview {
    opacity: 1;
  }
  .sortable {
    cursor: pointer;

    &:hover {
      color: var(--color-text);
    }
  }
</style>
