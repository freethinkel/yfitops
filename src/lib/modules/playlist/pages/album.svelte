<script lang="ts">
  import { PlaylistInfo } from "../components/playlist-info";
  import { TrackList } from "../components/track-list";
  import { TrackListSkeleton } from "../components/track-list-skeleton";
  import { playlistModel } from "../model";

  interface Props {
    id: string;
  }
  const { id }: Props = $props();

  const album = $derived(playlistModel.album(id));

  // album tracks come without their album — the table shows that column
  const tracks = $derived(
    $album?.tracks.items.map((track) => ({
      ...track,
      album: $album,
    })) as SpotifyApi.TrackObjectFull[] | undefined,
  );
</script>

<PlaylistInfo
  image={$album?.images?.[0]?.url}
  name={$album?.name}
  description={[
    $album?.artists.map((artist) => artist.name).join(", "),
    $album?.release_date?.slice(0, 4),
  ]
    .filter(Boolean)
    .join(" · ")}
/>

{#if tracks}
  <TrackList {tracks} />
{:else}
  <TrackListSkeleton />
{/if}
