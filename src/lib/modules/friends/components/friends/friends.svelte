<script lang="ts">
  import { friendsMessages } from "$lib/modules/i18n";
  import { Avatar } from "$lib/shared/components/avatar";
  import { Button } from "$lib/shared/components/button";
  import { Skeleton } from "$lib/shared/components/skeleton";
  import { formatRelative } from "$lib/shared/helpers/date-time";
  import { friendsModel } from "../../model";

  const t = friendsMessages;
  const friends = friendsModel.$friends;
  const isEnabled = friendsModel.$isEnabled;
  const error = friendsModel.$error;

  /** Playlists, albums and artists have pages here; anything else is inert. */
  const routeOf = (uri: string) => {
    const [, kind, id] = uri.split(":");
    return ["playlist", "album", "artist"].includes(kind) ? `/app/${kind}/${id}` : "";
  };
</script>

<aside class="friends">
  <header>
    <h2>{$t.title}</h2>
    {#if $friends?.length}
      <span class="count">{$friends.length}</span>
    {/if}
  </header>

  {#if !$isEnabled}
    <div class="notice">
      <p>{$t.notice}</p>
      <Button kind="ghost" onclick={() => friendsModel.enable()}>{$t.enable}</Button>
    </div>
  {:else if $error}
    <p class="empty">{$t.failed({ error: $error })}</p>
  {:else if !$friends}
    <div class="list">
      {#each Array(10) as _, index (index)}
        <div class="row">
          <Skeleton width="2.25rem" height="2.25rem" />
          <div class="meta">
            <Skeleton width="50%" height="0.5rem" />
            <Skeleton width="85%" height="0.5rem" />
          </div>
        </div>
      {/each}
    </div>
  {:else if $friends.length}
    <div class="list">
      {#each $friends as friend (friend.id)}
        <div class="row">
          <a class="portrait" href="/app/user/{friend.id}" title={friend.name}>
            <Avatar source={friend.avatar} size={36} />
            <!-- the artwork rides the avatar instead of taking a column -->
            <img class="cover" src={friend.cover} alt="" />
          </a>

          <div class="meta">
            <div class="line">
              <a class="name" href="/app/user/{friend.id}">{friend.name}</a>
              <time>{formatRelative(friend.playedAt)}</time>
            </div>

            <div class="line secondary">
              {#if routeOf(friend.albumUri)}
                <a class="track" href={routeOf(friend.albumUri)}>{friend.track}</a>
              {:else}
                <span class="track">{friend.track}</span>
              {/if}

              {#if friend.context}
                <span class="dot">·</span>
                {#if routeOf(friend.contextUri)}
                  <a class="context" href={routeOf(friend.contextUri)}>
                    {friend.context}
                  </a>
                {:else}
                  <span class="context">{friend.context}</span>
                {/if}
              {/if}
            </div>
          </div>
        </div>
      {/each}
    </div>
  {:else}
    <p class="empty">{$t.empty}</p>
  {/if}
</aside>

<style>
  .friends {
    display: flex;
    flex-direction: column;
    height: 100%;
    width: 100%;
    padding: 0.5rem;
    gap: 0.25rem;
    overflow: hidden;
  }
  header {
    display: flex;
    align-items: baseline;
    gap: 0.375rem;
    padding: 0 0.25rem;
  }
  h2 {
    margin: 0;
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: oklch(from var(--color-text) l c h / 0.6);
  }
  .count {
    font-size: 0.66rem;
    font-variant-numeric: tabular-nums;
    color: oklch(from var(--color-text) l c h / 0.4);
  }
  .list {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    scrollbar-width: none;

    &::-webkit-scrollbar {
      display: none;
    }
  }
  .row {
    display: flex;
    align-items: center;
    gap: 0.625rem;
    padding: 0.5rem;
    border-radius: var(--border-radius);

    &:hover {
      background: oklch(from var(--color-text) l c h / 0.04);
    }
  }
  .portrait {
    position: relative;
    display: flex;
    flex-shrink: 0;
  }
  .cover {
    position: absolute;
    right: -0.125rem;
    bottom: -0.125rem;
    width: 1.125rem;
    height: 1.125rem;
    border-radius: 3px;
    object-fit: cover;
    /* punched out of the avatar so the two shapes stay apart */
    outline: 2px solid var(--color-background);
    background: var(--color-background);
  }
  .meta {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
    line-height: 1.3;
  }
  .line {
    display: flex;
    align-items: baseline;
    gap: 0.25rem;
    min-width: 0;
  }
  .secondary {
    font-size: 0.7rem;
    color: oklch(from var(--color-text) l c h / 0.6);
  }
  .name {
    flex: 1;
    min-width: 0;
    font-size: 0.9rem;
    font-weight: 600;
  }
  time {
    font-size: 0.62rem;
    color: oklch(from var(--color-text) l c h / 0.4);
    white-space: nowrap;
  }
  .track {
    flex-shrink: 1;
  }
  .context {
    flex-shrink: 2;
  }
  .dot {
    flex-shrink: 0;
  }
  .name,
  .track,
  .context {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  /* every link in the row stands on its own — user, track, playlist */
  a {
    color: inherit;
    text-decoration: none;

    &:hover {
      text-decoration: underline;
    }
  }
  .notice {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.5rem;
    padding: 0.375rem 0.25rem;
  }
  .notice p,
  .empty {
    margin: 0;
    font-size: 0.72rem;
    line-height: 1.4;
    color: oklch(from var(--color-text) l c h / 0.6);
  }
  .empty {
    padding: 0.375rem 0.25rem;
  }
</style>
