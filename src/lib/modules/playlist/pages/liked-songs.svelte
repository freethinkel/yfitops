<script lang="ts">
  import { playerModel } from "$lib/modules/player/model";
  import { Button } from "$lib/shared/components/button";
  import { Icon } from "$lib/shared/components/icon";
  import { PlaylistInfo } from "../components/playlist-info";
  import { TrackList } from "../components/track-list";
  import { playlistModel } from "../model";

  const likedSongs = playlistModel.$likedSongs;
  const tracks = $derived($likedSongs?.map((item) => item.track));

  /**
   * Liked songs have no context uri a device can play, so the uris go over
   * directly. The API caps a request at a few hundred, hence the slice.
   */
  const PLAY_LIMIT = 300;
  const uris = $derived((tracks ?? []).slice(0, PLAY_LIMIT).map(({ uri }) => uri));
</script>

<PlaylistInfo name="Liked songs" description="{tracks?.length ?? 0} tracks">
  <Button disabled={!uris.length} onclick={() => playerModel.play(uris)}>
    <Icon name="play" size={16} />
    Слушать
  </Button>

  <Button
    kind="ghost"
    disabled={!uris.length}
    onclick={() => playerModel.playShuffled(uris)}
  >
    <Icon name="shuffle" size={16} />
    Вперемешку
  </Button>
</PlaylistInfo>

<TrackList {tracks} />
