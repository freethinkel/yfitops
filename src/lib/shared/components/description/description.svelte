<script lang="ts">
  import { sanitizeDescription } from "$lib/shared/helpers/sanitize";

  interface Props {
    text?: string;
    /** Off inside anything already clickable — see the sanitizer. */
    links?: boolean;
  }
  const { text = "", links = true }: Props = $props();

  const html = $derived(sanitizeDescription(text, links));
</script>

<!-- no element of its own: the caller decides whether this is a paragraph or a
     line in a card, and only the sanitising is shared -->
{@html html}
