<script lang="ts">
  import { playerModel } from "$lib/modules/player/model";
  import { Button } from "$lib/shared/components/button";
  import { lyricsModel } from "../../model";
  import { lyricsMessages } from "$lib/modules/i18n";

  const t = lyricsMessages;
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
    <p class="empty">{$t.notice}</p>
    <Button kind="ghost" onclick={() => lyricsModel.enable()}>{$t.enable}</Button>
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
    <p class="empty">{$t.loading}</p>
  {:else if $error}
    <p class="empty">{$t.failed({ error: $error })}</p>
  {:else}
    <p class="empty">{$t.empty}</p>
  {/if}
</div>

<style>
  .lyrics {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
    overflow: auto;
    padding: 0.25rem 0;
  }
  .line {
    appearance: none;
    border: none;
    background: none;
    padding: 0.125rem 0.25rem;
    margin: 0 -0.25rem;
    border-radius: var(--border-radius);
    text-align: left;
    font-family: inherit;
    font-size: 0.94rem;
    font-weight: 600;
    line-height: 1.25;
    color: var(--color-text);
  }
  .synced .line {
    color: oklch(from var(--color-text) l c h / 0.6);
    transition: var(--transition);
    cursor: pointer;

    &:hover {
      background: oklch(from var(--color-text) l c h / 0.04);
      color: var(--color-text);
    }

    &.passed {
      color: oklch(from var(--color-text) l c h / 0.12);
    }
    &.active {
      color: var(--color-accent);
    }
  }
  .empty {
    margin: 0;
    color: oklch(from var(--color-text) l c h / 0.6);
    font-size: 0.84rem;
  }
</style>
