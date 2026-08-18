<script lang="ts">
  import { goto } from "$app/navigation";
  import { Section } from "$lib/modules/home/components/section";
  import { TrackList } from "$lib/modules/playlist/components/track-list";
  import { Card } from "$lib/shared/components/card";
  import { SearchInput } from "$lib/shared/components/search-input";
  import { routeForLink } from "$lib/shared/helpers/spotify-link";
  import { searchModel } from "../model";
  import { searchMessages } from "$lib/modules/i18n";

  const t = searchMessages;
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

<SearchInput placeholder={$t.placeholder} value={$query} oninput={onInput} />

{#if $results}
  {#if isEmpty}
    {#if !$isPending}
      <p class="empty">{$t.nothingFound}</p>
    {/if}
  {:else}
    {#if $results.artists.length}
      <Section title={$t.artists} loaded empty={false}>
        {#each $results.artists as artist (artist.id)}
          <Card
            round
            title={artist.name}
            subtitle={artist.genres?.[0] ?? $t.artist}
            image={artist.images?.[0]?.url}
            onclick={() => goto(`/app/artist/${artist.id}`)}
          />
        {/each}
      </Section>
    {/if}

    {#if $results.albums.length}
      <Section title={$t.albums} loaded empty={false}>
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
      <Section title={$t.playlists} loaded empty={false}>
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
      <h2 class="tracks_title">{$t.tracks}</h2>
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
  .empty {
    margin: 0;
    padding: 1.25rem;
    text-align: center;
    color: oklch(from var(--color-text) l c h / 0.6);
  }
</style>
