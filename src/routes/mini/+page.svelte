<script lang="ts">
  import { emit, listen } from "@tauri-apps/api/event";
  import { onMount } from "svelte";
  import { Cover } from "$lib/shared/components/cover";
  import { Icon } from "$lib/shared/components/icon";
  import { Slider } from "$lib/shared/components/slider";
  import {
    MINI_COMMAND,
    MINI_HELLO,
    MINI_STATE,
    type MiniCommand,
    type MiniState,
  } from "$lib/modules/player/model/mini-bridge";

  // deliberately not `$lib/modules/player/model`: that index pulls in the Web
  // Playback SDK, which would register a second device from this window
  let state = $state<MiniState>({
    cover: "",
    name: "",
    artist: "",
    paused: true,
    position: 0,
    duration: 0,
  });

  const progress = $derived(
    state.duration ? state.position / state.duration : 0,
  );

  const send = (command: MiniCommand) => emit(MINI_COMMAND, command);

  onMount(() => {
    const stop = listen<MiniState>(MINI_STATE, ({ payload }) => {
      state = payload;
    });

    emit(MINI_HELLO);

    return () => stop.then((off) => off());
  });
</script>

<!-- the artwork is the window, and dragging it moves the window -->
<div class="mini" data-tauri-drag-region>
  <Cover url={state.cover} size={260} fill />

  <div class="overlay" data-tauri-drag-region>
    <button
      class="restore"
      type="button"
      aria-label="Back to the app"
      onclick={() => send({ kind: "restore" })}
    >
      <Icon name="expand" size={16} />
    </button>

    <div class="meta">
      <div class="name">{state.name}</div>
      <div class="artist">{state.artist}</div>
    </div>

    <div class="controls">
      <button
        type="button"
        aria-label="Previous track"
        onclick={() => send({ kind: "prev" })}
      >
        <Icon name="previous-track" size={26} />
      </button>
      <button
        class="play"
        type="button"
        aria-label="Play/pause"
        onclick={() => send({ kind: "toggle" })}
      >
        <Icon name={state.paused ? "play" : "pause"} size={36} />
      </button>
      <button
        type="button"
        aria-label="Next track"
        onclick={() => send({ kind: "next" })}
      >
        <Icon name="next-track" size={26} />
      </button>
    </div>

    <div class="slider">
      <Slider
        value={progress}
        onchange={(value) =>
          send({ kind: "seek", position: value * state.duration })}
      />
    </div>
  </div>
</div>

<style>
  :global(body) {
    background: var(--color-background);
    overflow: hidden;
  }
  /* no radius of its own: the window keeps its titlebar, so macOS rounds and
     clips the webview along with it */
  .mini {
    position: relative;
    width: 100vw;
    height: 100vh;
    overflow: hidden;
  }
  .mini :global(.wrapper) {
    border-radius: 0;
    border: none;
  }

  /* the controls sit on the artwork, so they need their own ground to stay
     legible whatever the cover looks like */
  .overlay {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    padding: 0.75rem;
    background: rgba(0, 0, 0, 0.45);
    color: #fff;
    opacity: 0;
    transition: var(--transition);
  }
  .mini:hover .overlay {
    opacity: 1;
  }
  .meta {
    /* the window is 260px wide and the title can be anything, so both lines
       are cut rather than allowed to push the layout around */
    max-width: 100%;
    text-align: center;
  }
  .name,
  .artist {
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .name {
    font-size: 0.89rem;
    font-weight: 600;
    line-height: 1.2;
  }
  .artist {
    margin-top: 0.125rem;
    font-size: 0.75rem;
    opacity: 0.75;
  }
  .controls {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }
  .slider {
    position: absolute;
    left: 0.75rem;
    right: 0.75rem;
    bottom: 0.75rem;

    /* the slider paints itself from the app's tokens, and the overlay is dark
       whatever the theme is — so the tokens are redefined for this corner */
    --color-text: #fff;
    --color-accent: #fff;
  }
  .restore {
    position: absolute;
    top: 0.5rem;
    right: 0.5rem;
    padding: 0.25rem;
    border-radius: 999px;
    background: rgba(0, 0, 0, 0.55);
  }
  button {
    appearance: none;
    border: none;
    background: none;
    padding: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    color: inherit;
    cursor: pointer;

    &:hover {
      opacity: 0.75;
    }
  }
  .play {
    width: 2.75rem;
    height: 2.75rem;
  }
</style>
