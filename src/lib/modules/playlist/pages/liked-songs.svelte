<script lang="ts">
  import { playerModel } from "$lib/modules/player/model";
  import { Button } from "$lib/shared/components/button";
  import { Icon } from "$lib/shared/components/icon";
  import { PlaylistInfo } from "../components/playlist-info";
  import { TrackList } from "../components/track-list";
  import { playlistModel } from "../model";
  import { libraryMessages } from "$lib/modules/i18n";

  const t = libraryMessages;
  const likedSongs = playlistModel.$likedSongs;
  const tracks = $derived(
    $likedSongs?.map((item) => ({ ...item.track, added_at: item.added_at })),
  );

  /**
   * Liked songs have no context uri a device can play, so the uris go over
   * directly. The API caps a request at a few hundred, hence the slice.
   */
  const PLAY_LIMIT = 300;
  const uris = $derived((tracks ?? []).slice(0, PLAY_LIMIT).map(({ uri }) => uri));
</script>

<PlaylistInfo name={$t.likedSongs} description={$t.trackCount(tracks?.length ?? 0)}>
  <Button disabled={!uris.length} onclick={() => playerModel.play(uris)}>
    <Icon name="play" size={16} />
    {$t.play}
  </Button>

  <Button
    kind="ghost"
    disabled={!uris.length}
    onclick={() => playerModel.playShuffled(uris)}
  >
    <Icon name="shuffle" size={16} />
    {$t.shuffle}
  </Button>
</PlaylistInfo>

<TrackList {tracks} />
