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
  .themes {
    width: 100%;
    max-width: 420px;
    margin: 10px 0;
  }
  h2 {
    margin: 0 0 8px;
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--color-text-60);
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
    gap: 6px;
  }
  .theme {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 8px;
    appearance: none;
    background: none;
    border: 1px solid var(--color-surface-20);
    border-radius: var(--border-radius);
    color: var(--color-text-100);
    font-family: inherit;
    font-size: 0.9rem;
    cursor: pointer;
    transition: var(--transition);

    &:hover {
      background: var(--color-surface-10);
    }
    &.active {
      border-color: var(--color-accent-100);
      background: var(--color-accent-10);
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
