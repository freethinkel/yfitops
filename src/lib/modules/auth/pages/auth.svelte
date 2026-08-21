<script lang="ts">
  import { goto } from "$app/navigation";
  import { Button } from "$lib/shared/components/button";
  import { webSession } from "../model";
  import { authMessages } from "$lib/modules/i18n";

  const isAuthorized = webSession.$isAuthorized;
  const isPending = webSession.$isPending;
  const error = webSession.$error;
  const t = authMessages;

  $effect(() => {
    if ($isAuthorized) goto("/app", { replaceState: true });
  });
</script>

<div class="page">
  <div data-tauri-drag-region class="drag"></div>
  <div class="form">
    <Button disabled={$isPending} onclick={() => webSession.login()}>
      {$isPending ? $t.signingIn : $t.login}
    </Button>
    {#if $error}
      <p class="error">{$error}</p>
    {/if}
  </div>
</div>

<style>
  .page {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
  }
  .drag {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 36px;
  }
  .form {
    width: 220px;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;

    & :global(button) {
      width: 100%;
    }
  }
  .error {
    margin: 0;
    font-size: 0.8rem;
    color: var(--color-error);
    text-align: center;
  }
</style>
