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
    padding: 0.25rem;
    align-items: center;
    gap: 0.375rem;
    border-radius: var(--border-radius);
    font-size: 0.84rem;
    font-weight: 600;
    width: 100%;
    text-align: left;
    text-decoration: none;
    color: var(--color-text);

    &:hover,
    &.active {
      background: oklch(from var(--color-text) l c h / 0.04);
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
