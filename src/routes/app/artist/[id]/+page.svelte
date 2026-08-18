<script lang="ts">
  import { page } from "$app/state";
  import { ArtistPage } from "$lib/modules/playlist/pages";
</script>

<ArtistPage id={page.params.id ?? ""} />
