<script lang="ts">
  import { page } from "$app/state";
  import { AlbumPage } from "$lib/modules/playlist/pages";
</script>

<AlbumPage id={page.params.id ?? ""} />
