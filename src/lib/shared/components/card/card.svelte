<script lang="ts">
  import { Cover } from "$lib/shared/components/cover";

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
    <span class="subtitle">{subtitle}</span>
  {/if}
</button>

<style>
  .card {
    appearance: none;
    border: none;
    background: none;
    padding: 6px;
    width: 140px;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
    text-align: left;
    color: var(--color-text-100);
    border-radius: var(--border-radius);
    cursor: pointer;
    transition: var(--transition);

    &:hover {
      background: var(--color-surface-10);
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
    margin-top: 6px;
    font-size: 0.9rem;
    font-weight: 600;
  }
  .subtitle {
    font-size: 0.8rem;
    color: var(--color-text-60);
  }
</style>
