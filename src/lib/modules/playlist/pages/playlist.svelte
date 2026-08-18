<script lang="ts">
  import { Button } from "$lib/shared/components/button";
  import { PlaylistInfo } from "../components/playlist-info";
  import { TrackList } from "../components/track-list";
  import { TrackListSkeleton } from "../components/track-list-skeleton";
  import { playlistModel } from "../model";

  interface Props {
    id: string;
  }
  const { id }: Props = $props();

  const playlist = $derived(playlistModel.playlist(id));
  const followed = $derived(playlistModel.isFollowed(id));

  let busy = $state(false);

  const toggleFollow = async () => {
    busy = true;
    try {
      await ($followed
        ? playlistModel.unfollowPlaylist(id)
        : playlistModel.followPlaylist(id));
    } finally {
      busy = false;
    }
  };
  const tracks = $derived(
    $playlist?.tracks.items
      .map((item) => item.track)
      .filter(Boolean) as SpotifyApi.TrackObjectFull[] | undefined,
  );
</script>

<PlaylistInfo
  image={$playlist?.images?.[0]?.url}
  name={$playlist?.name}
  description={$playlist?.description ?? ""}
>
  <Button
    kind={$followed ? "ghost" : "filled"}
    disabled={busy || !$playlist}
    onclick={toggleFollow}
  >
    {$followed ? "В библиотеке" : "Добавить"}
  </Button>
</PlaylistInfo>

{#if tracks}
  <TrackList {tracks} />
{:else}
  <TrackListSkeleton />
{/if}
