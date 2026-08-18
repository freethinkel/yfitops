<script lang="ts">
  import { goto } from "$app/navigation";
  import { userMessages } from "$lib/modules/i18n";
  import { Card } from "$lib/shared/components/card";
  import { PlaylistInfo } from "$lib/modules/playlist/components/playlist-info";
  import { Section } from "$lib/modules/home/components/section";
  import { userModel } from "../model";

  interface Props {
    id: string;
  }
  const { id }: Props = $props();

  const t = userMessages;
  const user = $derived(userModel.user(id));
</script>

<PlaylistInfo
  image={$user?.profile.images?.[0]?.url}
  name={$user?.profile.display_name ?? ""}
  description={$user ? $t.followers($user.profile.followers?.total ?? 0) : ""}
/>

<Section
  title={$t.publicPlaylists}
  loaded={!!$user}
  empty={!$user?.playlists.length}
>
  {#each $user?.playlists ?? [] as playlist (playlist.id)}
    <Card
      icon="playlist"
      title={playlist.name}
      subtitle={playlist.owner?.display_name ?? ""}
      image={playlist.images?.[0]?.url}
      onclick={() => goto(`/app/playlist/${playlist.id}`)}
    />
  {/each}
</Section>
