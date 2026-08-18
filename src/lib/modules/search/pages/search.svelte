<script lang="ts">
  import { goto } from "$app/navigation";
  import { Section } from "$lib/modules/home/components/section";
  import { TrackList } from "$lib/modules/playlist/components/track-list";
  import { Card } from "$lib/shared/components/card";
  import { Icon } from "$lib/shared/components/icon";
  import { routeForLink } from "$lib/shared/helpers/spotify-link";
  import { searchModel } from "../model";

  const query = searchModel.$query;
  const results = searchModel.$results;
  const isPending = searchModel.$isPending;

  /** Pasting a playlist, album or artist link jumps straight to its page. */
  const onInput = (value: string) => {
    const route = routeForLink(value.trim());

    if (route) {
      searchModel.search("");
      goto(route);
      return;
    }

    searchModel.search(value);
  };

  const isEmpty = $derived(
    !!$results &&
      !$results.tracks.length &&
      !$results.artists.length &&
      !$results.albums.length &&
      !$results.playlists.length,
  );
</script>

<div class="search">
  <Icon name="search" size={16} />
  <input
    type="search"
    placeholder="Songs, artists, albums"
    value={$query}
    oninput={(event) => onInput(event.currentTarget.value)}
  />
</div>

{#if $results}
  {#if isEmpty}
    {#if !$isPending}
      <p class="empty">Nothing found</p>
    {/if}
  {:else}
    {#if $results.artists.length}
      <Section title="Артисты" loaded empty={false}>
        {#each $results.artists as artist (artist.id)}
          <Card
            round
            title={artist.name}
            subtitle={artist.genres?.[0] ?? "Артист"}
            image={artist.images?.[0]?.url}
            onclick={() => goto(`/app/artist/${artist.id}`)}
          />
        {/each}
      </Section>
    {/if}

    {#if $results.albums.length}
      <Section title="Альбомы" loaded empty={false}>
        {#each $results.albums as album (album.id)}
          <Card
            icon="playlist"
            title={album.name}
            subtitle={(album.artists ?? []).map((artist) => artist.name).join(", ")}
            image={album.images?.[0]?.url}
            onclick={() => goto(`/app/album/${album.id}`)}
          />
        {/each}
      </Section>
    {/if}

    {#if $results.playlists.length}
      <Section title="Плейлисты" loaded empty={false}>
        {#each $results.playlists as playlist (playlist.id)}
          <Card
            icon="playlist"
            title={playlist.name}
            subtitle={playlist.owner?.display_name ?? ""}
            image={playlist.images?.[0]?.url}
            onclick={() => goto(`/app/playlist/${playlist.id}`)}
          />
        {/each}
      </Section>
    {/if}

    {#if $results.tracks.length}
      <h2 class="tracks_title">Треки</h2>
      <TrackList tracks={$results.tracks} />
    {/if}
  {/if}
{:else if $isPending}
  <TrackList tracks={undefined} />
{/if}

<style>
  .tracks_title {
    margin: 0.625rem 0 0;
    padding: 0 1rem;
    font-size: 1.03rem;
  }
  .search {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin: 0.625rem;
    padding: 0 0.625rem;
    height: 34px;
    border-radius: var(--border-radius);
    background: oklch(from var(--color-text) l c h / 0.04);
    border: 1px solid oklch(from var(--color-text) l c h / 0.12);
    color: oklch(from var(--color-text) l c h / 0.6);

    &:focus-within {
      border-color: var(--color-accent);
    }
  }
  input {
    flex: 1;
    min-width: 0;
    appearance: none;
    border: none;
    background: none;
    outline: none;
    font-size: 0.94rem;
    color: var(--color-text);

    &::-webkit-search-cancel-button {
      appearance: none;
    }
  }
  .empty {
    margin: 0;
    padding: 1.25rem;
    text-align: center;
    color: oklch(from var(--color-text) l c h / 0.6);
  }
</style>
