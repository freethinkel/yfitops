<script lang="ts">
  import { page } from "$app/state";
  import { Avatar } from "$lib/shared/components/avatar";
  import { userModel } from "../../model";

  const userData = userModel.$userData;
  const href = "/app/profile";
</script>

<a {href} class="btn" class:active={page.url.pathname === href}>
  <Avatar source={$userData?.images?.[0]?.url ?? ""} />
  <span>{$userData?.display_name ?? $userData?.email ?? ""}</span>
</a>

<style>
  .btn {
    justify-content: flex-start;
    display: flex;
    padding: 4px;
    align-items: center;
    gap: 6px;
    border-radius: var(--border-radius);
    font-size: 0.9rem;
    font-weight: 600;
    width: 100%;
    text-align: left;
    text-decoration: none;
    color: var(--color-text-100);

    &:hover,
    &.active {
      background: var(--color-surface-10);
    }
  }
  span {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
</style>
