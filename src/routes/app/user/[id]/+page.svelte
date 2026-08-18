<script lang="ts">
  import { page } from "$app/state";
  import { UserPage } from "$lib/modules/user/pages";
</script>

<UserPage id={page.params.id ?? ""} />
