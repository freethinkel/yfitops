<script lang="ts">
  import { Avatar } from "$lib/shared/components/avatar";
  import { Button } from "$lib/shared/components/button";
  import { authModel } from "$lib/modules/auth/model";
  import { themeModel } from "$lib/modules/theme/model";
  import { userModel } from "../model";

  const userData = userModel.$userData;
  const themes = themeModel.$themes;
  const theme = themeModel.$theme;
</script>

<div class="page">
  <Avatar source={$userData?.images?.[0]?.url ?? ""} size={80} />
  <h1>{$userData?.display_name ?? ""}</h1>
  <p>{$userData?.email ?? ""}</p>

  <section class="themes">
    <h2>Тема</h2>
    <div class="grid">
      {#each $themes as item (item.id)}
        <button
          class="theme"
          class:active={item.id === $theme.id}
          type="button"
          onclick={() => themeModel.selectTheme(item.id)}
        >
          <span
            class="swatch"
            style:background={item.dark.background}
            style:border-color={item.dark.accent}
          >
            <span class="dot" style:background={item.dark.accent}></span>
          </span>
          {item.name}
        </button>
      {/each}
    </div>
  </section>

  <Button kind="ghost" onclick={() => authModel.logout()}>Log out</Button>
</div>

<style>
  .page {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
    padding: 1.5rem;
  }
  h1 {
    margin: 0;
    font-size: 1.31rem;
  }
  p {
    margin: 0;
    color: oklch(from var(--color-text) l c h / 0.6);
  }
  .themes {
    width: 100%;
    max-width: 420px;
    margin: 0.625rem 0;
  }
  h2 {
    margin: 0 0 0.5rem;
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: oklch(from var(--color-text) l c h / 0.6);
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
    gap: 0.375rem;
  }
  .theme {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.375rem 0.5rem;
    appearance: none;
    background: none;
    border: 1px solid oklch(from var(--color-text) l c h / 0.12);
    border-radius: var(--border-radius);
    color: var(--color-text);
    font-family: inherit;
    font-size: 0.84rem;
    cursor: pointer;
    transition: var(--transition);

    &:hover {
      background: oklch(from var(--color-text) l c h / 0.04);
    }
    &.active {
      border-color: var(--color-accent);
      background: oklch(from var(--color-accent) l c h / 0.1);
    }
  }
  .swatch {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    border-radius: 6px;
    border: 1px solid;
    flex-shrink: 0;
  }
  .dot {
    width: 8px;
    height: 8px;
    border-radius: 10em;
  }
</style>
