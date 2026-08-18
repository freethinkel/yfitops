<script lang="ts">
  import { playerModel } from "$lib/modules/player/model";
  import { userModel } from "$lib/modules/user/model";
  import { Button } from "$lib/shared/components/button";
  import { Icon } from "$lib/shared/components/icon";
  import { PlaylistInfo } from "../components/playlist-info";
  import { TrackList } from "../components/track-list";
  import { playlistModel } from "../model";

  interface Props {
    id: string;
  }
  const { id }: Props = $props();

  const playlist = $derived(playlistModel.playlist(id));
  const followed = $derived(playlistModel.isFollowed(id));

  const userData = userModel.$userData;
  const editablePlaylists = playlistModel.$editablePlaylists;

  const mine = $derived(!!$userData && $playlist?.owner?.id === $userData.id);
  const editable = $derived($editablePlaylists.some((item) => item.id === id));

  // Spotify has no delete endpoint: dropping your own playlist is unfollowing
  // it, the label just has to say what it means to the user
  const label = $derived(!$followed ? "Добавить" : mine ? "Удалить" : "Отписаться");

  let busy = $state(false);

  const toggleFollow = async () => {
    if ($followed && mine && !confirm(`Удалить плейлист «${$playlist?.name}»?`)) {
      return;
    }

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
  <Button onclick={() => playerModel.playContext(`spotify:playlist:${id}`)}>
    <Icon name="play" size={16} />
    Слушать
  </Button>

  <Button
    kind="ghost"
    onclick={() => playerModel.shuffleContext(`spotify:playlist:${id}`)}
  >
    <Icon name="shuffle" size={16} />
    Вперемешку
  </Button>

  <Button
    kind={$followed ? "ghost" : "filled"}
    disabled={busy || !$playlist}
    onclick={toggleFollow}
  >
    {label}
  </Button>
</PlaylistInfo>

<TrackList {tracks} removeFrom={editable ? id : undefined} />
