<script lang="ts">
  import { goto } from "$app/navigation";
  import { Card } from "$lib/shared/components/card";
  import { Section } from "$lib/modules/home/components/section";
  import { Button } from "$lib/shared/components/button";
  import { PlaylistInfo } from "../components/playlist-info";
  import { TrackList } from "../components/track-list";
  import { playlistModel } from "../model";

  interface Props {
    id: string;
  }
  const { id }: Props = $props();

  const artist = $derived(playlistModel.artist(id));

  const saved = $derived(playlistModel.isFollowedArtist(id));
  let busy = $state(false);

  const toggle = async () => {
    busy = true;
    try {
      await playlistModel.toggleFollowedArtist(id, saved);
    } finally {
      busy = false;
    }
  };
</script>

<PlaylistInfo
  image={$artist?.artist.images?.[0]?.url}
  name={$artist?.artist.name}
  description={$artist?.artist.genres.slice(0, 3).join(", ") ?? ""}
>
  <Button
    kind={$saved ? "ghost" : "filled"}
    disabled={busy || $saved === null}
    onclick={toggle}
  >
    {$saved ? "Вы подписаны" : "Подписаться"}
  </Button>
</PlaylistInfo>

<TrackList tracks={$artist?.topTracks} />

{#if $artist}

  <Section
    title="Albums"
    loaded={true}
    empty={!$artist.albums.length}
  >
    {#each $artist.albums as album (album.id)}
      <Card
        icon="playlist"
        title={album.name}
        subtitle={album.album_type}
        image={album.images[0]?.url}
        onclick={() => goto(`/app/album/${album.id}`)}
      />
    {/each}
  </Section>
{/if}
