<script lang="ts">
  import { PlaylistInfo } from "../components/playlist-info";
  import { TrackList } from "../components/track-list";
  import { TrackListSkeleton } from "../components/track-list-skeleton";
  import { playlistModel } from "../model";

  const likedSongs = playlistModel.$likedSongs;
  const tracks = $derived($likedSongs?.map((item) => item.track));
</script>

<PlaylistInfo name="Liked songs" description="{tracks?.length ?? 0} tracks" />

{#if tracks}
  <TrackList {tracks} />
{:else}
  <TrackListSkeleton />
{/if}
