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
  import { libraryMessages, menuMessages } from "$lib/modules/i18n";

  /** Playlists and liked songs know when a track was added; nothing else does. */
  type TrackRow = SpotifyApi.TrackObjectFull & { added_at?: string };

  interface Props {
    /** undefined while loading — the table then draws itself as skeletons */
    tracks?: readonly TrackRow[];
    /** Set on a playlist page the user may edit — enables "remove from it". */
    removeFrom?: string;
  }
  const { tracks, removeFrom }: Props = $props();

  const t = libraryMessages;
  const tm = menuMessages;
  const loading = $derived(!tracks);

  type Column = {
    title: string;
    width: string;
    sort?: (track: TrackRow) => string | number;
  };

  // the column only exists where the data does — an album has no added date
  const hasAdded = $derived((tracks ?? []).some((track) => track.added_at));

  /**
   * Narrow panels drop columns instead of scrolling sideways: a horizontal
   * scroller would become the sticky header's scrollport and unstick it.
   */
  let tableWidth = $state(Infinity);

  const showArtist = $derived(tableWidth >= 420);
  const showAlbum = $derived(tableWidth >= 560);
  const showAdded = $derived(hasAdded && tableWidth >= 720);

  const measure = (node: HTMLElement) => {
    const observer = new ResizeObserver(([entry]) => {
      tableWidth = entry.contentRect.width;
    });

    observer.observe(node);
    return { destroy: () => observer.disconnect() };
  };

  const COLUMNS: Column[] = $derived([
    { title: "#", width: "34px" },
    { title: "", width: "24px" },
    { title: "", width: "26px" },
    {
      title: $t.columnTrack,
      width: "minmax(120px, 3fr)",
      sort: (track) => track.name.toLowerCase(),
    },
    ...(showAlbum
      ? [
          {
            title: $t.columnAlbum,
            width: "minmax(80px, 2fr)",
            sort: (track: TrackRow) => track.album.name.toLowerCase(),
          },
        ]
      : []),
    ...(showArtist
      ? [
          {
            title: $t.columnArtist,
            width: "minmax(80px, 2fr)",
            sort: (track: TrackRow) => track.artists[0]?.name.toLowerCase() ?? "",
          },
        ]
      : []),
    ...(showAdded
      ? [
          {
            title: $t.columnAdded,
            width: "96px",
            sort: (track: TrackRow) => track.added_at ?? "",
          },
        ]
      : []),
    { title: $t.columnDuration, width: "72px", sort: (track) => track.duration_ms },
  ]);

  const template = $derived(COLUMNS.map(({ width }) => width).join(" "));

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
  /**
   * Track relinking: what the SDK plays in this market can carry a different
   * id than the one the playlist lists, and the original then sits in
   * `linked_from`. Matching on one id alone left rows unhighlighted.
   */
  const currentIds = $derived.by(() => {
    const track = $playerState?.track_window.current_track;
    return new Set(
      [track?.id, track?.linked_from?.id].filter((id): id is string => !!id),
    );
  });

  // ponytail: selection is state, not DOM focus — WebKit does not focus a
  // clicked div, so relying on focus meant having to Tab into the list first
  let selected = $state<number | null>(null);
  let body = $state<HTMLDivElement>();
  let rows = $state<HTMLDivElement>();

  const playingIndex = $derived(sorted.findIndex(({ id }) => currentIds.has(id)));

  /**
   * Only the rows in view are in the DOM — a liked library runs to thousands
   * of tracks, and the browser chokes long before that on real nodes. Rows are
   * a fixed 24px, so the window is plain arithmetic.
   *
   * The scrollbar keeps its size from a sizer of the full height, and the
   * window rides on a transform inside it. Padding would do the same job, but
   * every scroll step would relayout the subtree; a transform only recomposites.
   */
  const ROW_HEIGHT = 24;
  const OVERSCAN = 4;
  const SKELETON_ROWS = 24;

  let scroller = $state<HTMLElement | null>(null);
  let first = $state(0);
  let windowSize = $state(60);

  const last = $derived(Math.min(sorted.length, first + windowSize));
  const windowed = $derived(sorted.slice(first, last));

  const scrollableParent = (node: HTMLElement) => {
    for (let el = node.parentElement; el; el = el.parentElement) {
      if (/auto|scroll/.test(getComputedStyle(el).overflowY)) return el;
    }

    return document.scrollingElement as HTMLElement;
  };

  const virtualize = (node: HTMLElement) => {
    scroller = scrollableParent(node);

    const update = () => {
      if (!scroller) return;

      const above = scroller.getBoundingClientRect().top - node.getBoundingClientRect().top;

      first = Math.max(0, Math.floor(above / ROW_HEIGHT) - OVERSCAN);
      windowSize = Math.ceil(scroller.clientHeight / ROW_HEIGHT) + OVERSCAN * 2;
    };

    /**
     * Scroll fires faster than the screen redraws, and `update` reads layout —
     * measuring on every event forces a reflow each time, right after the last
     * write invalidated it. One measurement per frame is all the display can
     * show anyway.
     */
    let frame = 0;
    const schedule = () => {
      if (frame) return;

      frame = requestAnimationFrame(() => {
        frame = 0;
        update();
      });
    };

    update();
    scroller.addEventListener("scroll", schedule, { passive: true });

    const observer = new ResizeObserver(schedule);
    observer.observe(scroller);
    observer.observe(node);

    return {
      destroy() {
        cancelAnimationFrame(frame);
        scroller?.removeEventListener("scroll", schedule);
        observer.disconnect();
      },
    };
  };

  /** The row's element, or nothing when it is outside the rendered window. */
  const rowElement = (index: number) =>
    rows?.children[index - first] as HTMLElement | undefined;

  const select = (index: number) => {
    selected = Math.max(0, Math.min(index, sorted.length - 1));

    const element = rowElement(selected);
    if (element) return element.scrollIntoView({ block: "nearest" });

    // outside the window there is nothing to scroll to, so aim by arithmetic
    if (!body || !scroller) return;

    const bodyTop =
      body.getBoundingClientRect().top -
      scroller.getBoundingClientRect().top +
      scroller.scrollTop;

    scroller.scrollTop =
      bodyTop + selected * ROW_HEIGHT - scroller.clientHeight / 2;
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
      rowElement(selected)?.click();
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
          text: $tm.play,
          icon: NativeIcon.RightFacingTriangle,
          action: () =>
            playerModel.play(sorted.slice(index).map(({ uri }) => uri)),
        }),
        IconMenuItem.new({
          text: liked ? $t.unlike : $t.like,
          icon: liked ? NativeIcon.Remove : NativeIcon.Add,
          action: () => playlistModel.toggleLike(track),
        }),
        Submenu.new({
          text: $tm.addToPlaylist,
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
          text: $tm.addToQueue,
          icon: NativeIcon.ListView,
          action: () => playerModel.addToQueue(track.uri),
        }),
        ...(removeFrom
          ? [
              IconMenuItem.new({
                text: $tm.removeFromPlaylist,
                icon: NativeIcon.Remove,
                action: () => playlistModel.removeFromPlaylist(removeFrom, track.uri),
              }),
            ]
          : []),
        PredefinedMenuItem.new({ item: "Separator" }),
        IconMenuItem.new({
          text: $tm.goToAlbum,
          icon: NativeIcon.Folder,
          enabled: !!track.album.id,
          action: () => goto(`/app/album/${track.album.id}`),
        }),
        IconMenuItem.new({
          text: $tm.goToArtist,
          icon: NativeIcon.User,
          enabled: !!track.artists[0]?.id,
          action: () => goto(`/app/artist/${track.artists[0].id}`),
        }),
        PredefinedMenuItem.new({ item: "Separator" }),
        IconMenuItem.new({
          text: $tm.copyLink,
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

<div
  class="table"
  use:measure
  style:--track-columns={template}
  style:--row-height="{ROW_HEIGHT}px"
>
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

  <!-- the sizer holds the scrollbar open; the window inside it is what moves -->
  <div
    class="body"
    role="presentation"
    bind:this={body}
    use:virtualize
    style:height="{(loading ? SKELETON_ROWS : sorted.length) * ROW_HEIGHT}px"
  >
    <div
      class="window"
      role="rowgroup"
      bind:this={rows}
      style:transform="translate3d(0, {first * ROW_HEIGHT}px, 0)"
    >
    {#if loading}
      {#each Array(SKELETON_ROWS) as _, index (index)}
        <div class="row skeleton_row" class:odd={index % 2 === 1}>
          <span class="cell"></span>
          <span class="cell"></span>
          <span class="cell"><Skeleton width="1.25rem" height="1.25rem" /></span>
          <span class="cell"><Skeleton width="60%" height="0.625rem" /></span>
          {#if showAlbum}
            <span class="cell"><Skeleton width="45%" height="0.625rem" /></span>
          {/if}
          {#if showArtist}
            <span class="cell"><Skeleton width="50%" height="0.625rem" /></span>
          {/if}
          {#if showAdded}
            <span class="cell"><Skeleton width="3rem" height="0.625rem" /></span>
          {/if}
          <span class="cell"><Skeleton width="2rem" height="0.625rem" /></span>
        </div>
      {/each}
    {/if}

    <!--
      Deliberately unkeyed: the rows are recycled. A key by absolute index is
      cheaper while creeping — one row in, one row out — but a flick moves the
      window past itself, and then every key is new and all sixty rows are
      rebuilt. Without one, Svelte reuses the blocks by position and only
      updates the props that differ, which bounds the cost of a fast scroll.
    -->
    {#each windowed as track, offset}
      {@const index = first + offset}
      <Track
        {track}
        {index}
        addedAt={track.added_at}
        {showAdded}
        {showAlbum}
        {showArtist}
        liked={likedIds.has(track.id)}
        playing={currentIds.has(track.id)}
        selected={index === selected}
        onselect={() => (selected = index)}
        onplay={() => playerModel.play(sorted.slice(index).map(({ uri }) => uri))}
        onlike={() => playlistModel.toggleLike(track)}
        onmenu={(event) => openMenu(event, index)}
      />
      {/each}
    </div>
  </div>
</div>

<style>
  .body {
    position: relative;
  }
  .window {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    /* the rows are the only thing that moves while scrolling */
    will-change: transform;
  }
  /* --track-columns is set inline from the visible columns, so the header and
     the rows can never drift apart; the duration column is 72px rather than
     the 56px a time needs, because the header carries a sort chevron too */
  .table {
    font-variant-numeric: tabular-nums;
  }
  .head {
    display: grid;
    grid-template-columns: var(--track-columns);
    position: sticky;
    top: 0;
    z-index: 1;
    height: var(--row-height);
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
    height: var(--row-height);

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
