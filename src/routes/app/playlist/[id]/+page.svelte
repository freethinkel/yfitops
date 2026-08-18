<script lang="ts">
  import { page } from "$app/state";
  import { PlaylistPage } from "$lib/modules/playlist/pages";
</script>

<PlaylistPage id={page.params.id ?? ""} />
