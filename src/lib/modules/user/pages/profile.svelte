<script lang="ts">
  import { Avatar } from "$lib/shared/components/avatar";
  import { Button } from "$lib/shared/components/button";
  import { authModel } from "$lib/modules/auth/model";
  import { userModel } from "../model";

  const userData = userModel.$userData;
</script>

<div class="page">
  <Avatar source={$userData?.images?.[0]?.url ?? ""} size={80} />
  <h1>{$userData?.display_name ?? ""}</h1>
  <p>{$userData?.email ?? ""}</p>

  <Button kind="ghost" onclick={() => authModel.logout()}>Log out</Button>
</div>

<style>
  .page {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 24px;
  }
  h1 {
    margin: 0;
    font-size: 1.4rem;
  }
  p {
    margin: 0;
    color: var(--color-text-60);
  }
</style>
