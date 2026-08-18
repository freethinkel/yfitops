<script lang="ts">
  interface Props {
    width?: string;
    height?: string;
  }
  const { width = "", height = "" }: Props = $props();
</script>

<div class="skeleton" style:width style:height></div>

<style>
  .skeleton {
    background: var(--color-surface-10);
    border-radius: var(--border-radius);
    position: relative;
    overflow: hidden;

    &::before {
      content: "";
      position: absolute;
      inset: 0;
      animation: 1.5s loading ease-in-out infinite;
      background: linear-gradient(
        to right,
        transparent,
        var(--color-surface-10),
        transparent
      );
    }
  }

  @keyframes loading {
    0% {
      transform: translateX(-100%);
    }
    100% {
      transform: translateX(100%);
    }
  }
</style>
