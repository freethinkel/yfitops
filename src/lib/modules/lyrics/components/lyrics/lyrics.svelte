<script lang="ts">
  import { playerModel } from "$lib/modules/player/model";
  import { Button } from "$lib/shared/components/button";
  import { lyricsModel } from "../../model";

  const lyrics = lyricsModel.$lyrics;
  const isPending = lyricsModel.$isPending;
  const error = lyricsModel.$error;
  const isEnabled = lyricsModel.$isEnabled;
  const playerState = playerModel.$playerState;

  const position = $derived($playerState?.position ?? 0);

  /** The last line already started is the current one. */
  const activeIndex = $derived.by(() => {
    if (!$lyrics?.synced) return -1;

    let index = -1;
    for (const [i, line] of $lyrics.lines.entries()) {
      if (line.startMs > position) break;
      index = i;
    }
    return index;
  });

  const lineEls: HTMLButtonElement[] = [];
  let wrapperEl = $state<HTMLDivElement>();

  /**
   * scrollIntoView would drag every scrollable ancestor along with it, so the
   * panel scrolls itself and nothing else moves.
   */
  $effect(() => {
    const line = lineEls[activeIndex];
    if (!line || !wrapperEl) return;

    wrapperEl.scrollTo({
      top: line.offsetTop - wrapperEl.clientHeight / 2 + line.offsetHeight / 2,
      behavior: "smooth",
    });
  });
</script>

<div class="lyrics" class:synced={$lyrics?.synced} bind:this={wrapperEl}>
  {#if !$isEnabled}
    <p class="empty">
      Spotify hands lyrics only to librespot's client, so they need a sign-in of
      their own.
    </p>
    <Button kind="ghost" onclick={() => lyricsModel.enable()}>
      Enable lyrics
    </Button>
  {:else if $lyrics}
    {#each $lyrics.lines as line, index (index)}
      <button
        type="button"
        class="line"
        class:active={index === activeIndex}
        class:passed={activeIndex > index}
        disabled={!$lyrics.synced}
        bind:this={lineEls[index]}
        onclick={() => playerModel.seek(line.startMs)}
      >
        {line.text}
      </button>
    {/each}
  {:else if $isPending}
    <p class="empty">Loading lyrics…</p>
  {:else if $error}
    <p class="empty">Lyrics failed: {$error}</p>
  {:else}
    <p class="empty">No lyrics for this track</p>
  {/if}
</div>

<style>
  .lyrics {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 6px;
    overflow: auto;
    padding: 4px 0;
  }
  .line {
    appearance: none;
    border: none;
    background: none;
    padding: 2px 4px;
    margin: 0 -4px;
    border-radius: var(--border-radius);
    text-align: left;
    font-family: inherit;
    font-size: 1rem;
    font-weight: 600;
    line-height: 1.25;
    color: var(--color-text-100);
  }
  .synced .line {
    color: var(--color-text-60);
    transition: var(--transition);
    cursor: pointer;

    &:hover {
      background: var(--color-surface-10);
      color: var(--color-text-100);
    }

    &.passed {
      color: var(--color-surface-20);
    }
    &.active {
      color: var(--color-accent-100);
    }
  }
  .empty {
    margin: 0;
    color: var(--color-text-60);
    font-size: 0.9rem;
  }
</style>
