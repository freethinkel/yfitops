<script lang="ts">
  import { Cover } from "$lib/shared/components/cover";
  import { Description } from "$lib/shared/components/description";

  interface Props {
    title: string;
    subtitle?: string;
    image?: string;
    icon?: string;
    round?: boolean;
    onclick?: () => void;
  }
  const {
    title,
    subtitle = "",
    image = "",
    icon = "music",
    round = false,
    onclick,
  }: Props = $props();
</script>

<button class="card" class:round type="button" {onclick}>
  <Cover url={image} size={128} {icon} />
  <span class="title">{title}</span>
  {#if subtitle}
    <span class="subtitle"><Description text={subtitle} links={false} /></span>
  {/if}
</button>

<style>
  .card {
    appearance: none;
    border: none;
    background: none;
    padding: 0.375rem;
    width: 140px;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
    text-align: left;
    color: var(--color-text);
    border-radius: var(--border-radius);
    cursor: pointer;
    transition: var(--transition);

    &:hover {
      background: oklch(from var(--color-text) l c h / 0.04);
    }
  }
  .card.round :global(.cover) {
    border-radius: 10em;
  }
  .title,
  .subtitle {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .title {
    margin-top: 0.375rem;
    font-size: 0.84rem;
    font-weight: 600;
  }
  .subtitle {
    font-size: 0.75rem;
    color: oklch(from var(--color-text) l c h / 0.6);
  }
</style>
