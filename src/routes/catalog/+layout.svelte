<script lang="ts">
  import PageHeader from '#lib/PageHeader.svelte';

  let { children } = $props();
</script>

<PageHeader title="Каталог материалов" backHref="/" />
{@render children()}
