<script lang="ts">
  import { Skeleton } from "$lib/shared/components/skeleton";
</script>

<div class="wrapper">
  {#each Array(20) as _, index (index)}
    <Skeleton width="100%" height="18px" />
  {/each}
</div>

<style>
  .wrapper {
    padding: 6px;
    gap: 6px;
    display: flex;
    flex-direction: column;
  }
</style>
