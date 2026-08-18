<script lang="ts">
  import { goto } from "$app/navigation";
  import { Sidebar } from "$lib/modules/app/components/sidebar";
  import { appModel } from "$lib/modules/app/model";
  import { authModel } from "$lib/modules/auth/model";
  import { NowPlaying } from "$lib/modules/player/components/now-playing";
  import { Queue } from "$lib/modules/player/components/queue";
  import { Player } from "$lib/modules/player/components/player";
  import { Resizable } from "$lib/shared/components/resizable";
  import type { LayoutProps } from "./$types";

  const { children }: LayoutProps = $props();

  const isAuthorized = authModel.$isAuthorized;
  const isPending = authModel.$isPending;

  const sidebarWidth = appModel.$sidebarWidth;
  const detailsWidth = appModel.$detailsWidth;
  const detailsOpen = appModel.$detailsOpen;
  const detailsView = appModel.$detailsView;

  $effect(() => {
    if (!$isAuthorized && !$isPending) goto("/", { replaceState: true });
  });
</script>

<div class="wrapper">
  <Resizable
    width={$sidebarWidth}
    minWidth={150}
    maxWidth={350}
    onresize={appModel.setSidebarWidth}
  >
    <Sidebar />
  </Resizable>

  <div class="content">
    <div class="outlet">
      {@render children()}
    </div>

    <div class="player">
      <Player />
    </div>
  </div>

  {#if $detailsOpen}
    <Resizable
      side="right"
      width={$detailsWidth}
      minWidth={240}
      maxWidth={480}
      collapseAt={200}
      onresize={appModel.setDetailsWidth}
      oncollapse={appModel.closeDetails}
    >
      <div class="details">
        <!-- absolute so the panel's own scrolling content keeps the full height -->
        <div data-tauri-drag-region class="drag"></div>
        {#if $detailsView === "queue"}
          <Queue />
        {:else}
          <NowPlaying />
        {/if}
      </div>
    </Resizable>
  {/if}
</div>

<style>
  .wrapper {
    display: flex;
    height: 100%;
  }
  .content {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-width: 0;
    position: relative;
    background: var(--color-background);
    border-left: 1px solid oklch(from var(--color-text) l c h / 0.12);
  }
  .outlet {
    flex: 1;
    min-height: 0;
    overflow: auto;
    padding-bottom: 5.625rem;
  }
  .drag {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 2.25rem;
    z-index: 10;
    pointer-events: auto;
  }
  .details {
    position: relative;
    display: flex;
    flex-direction: column;
    height: 100%;
    border-left: 1px solid oklch(from var(--color-text) l c h / 0.12);
  }
  .player {
    position: absolute;
    left: 0.625rem;
    right: 0.625rem;
    bottom: 0.625rem;
    z-index: 100;
    display: flex;
    justify-content: center;

    & > :global(*) {
      max-width: 700px;
    }
  }
</style>
