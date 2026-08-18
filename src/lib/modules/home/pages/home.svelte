<script lang="ts">
  import { goto } from "$app/navigation";
  import { Button } from "$lib/shared/components/button";
  import { Card } from "$lib/shared/components/card";
  import { Section } from "../components/section";
  import { homeModel } from "../model";
  import { homeMessages } from "$lib/modules/i18n";

  const t = homeMessages;
  const greeting = homeModel.$greeting;
  const sections = homeModel.$sections;
  const isPending = homeModel.$isPending;
  const isEnabled = homeModel.$isEnabled;
  const error = homeModel.$error;

  /** spotify:playlist:xxx → /app/playlist/xxx */
  const open = (uri: string) => {
    const [, kind, id] = uri.split(":");
    if (["playlist", "album", "artist"].includes(kind)) goto(`/app/${kind}/${id}`);
  };
</script>

<div class="page">
  <h1>{$greeting || $t.title}</h1>

  {#if !$isEnabled}
    <div class="notice">
      <p>{$t.notice}</p>
      <Button onclick={() => homeModel.enable()}>{$t.enable}</Button>
    </div>
  {:else if $error}
    <div class="notice">
      <p class="error">{$error}</p>
      <Button kind="ghost" onclick={() => homeModel.reload()}>{$t.retry}</Button>
    </div>
  {:else}
    {#each $sections ?? [] as section (section.title)}
      <Section title={section.title} loaded empty={false}>
        {#each section.items as item (item.uri)}
          <Card
            title={item.name}
            subtitle={item.subtitle}
            image={item.image}
            round={item.round}
            icon="playlist"
            onclick={() => open(item.uri)}
          />
        {/each}
      </Section>
    {/each}

    {#if !$sections}
      {#each Array(3) as _, index (index)}
        <Section title="…" loaded={false} empty={false} />
      {/each}
    {/if}
  {/if}
</div>

<style>
  .page {
    padding-bottom: 0.625rem;
  }
  h1 {
    margin: 0;
    padding: 0.625rem 1rem 0;
    font-size: 1.5rem;
  }
  .notice {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.625rem;
    padding: 1rem;
    max-width: 480px;

    & p {
      margin: 0;
      color: oklch(from var(--color-text) l c h / 0.6);
    }
    & .error {
      color: var(--color-error);
    }
  }
</style>
