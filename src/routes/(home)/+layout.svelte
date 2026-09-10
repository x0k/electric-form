<script lang="ts">
  import PageHeader from '#lib/PageHeader.svelte';

  let { children } = $props();
</script>

<PageHeader title="Проекты электрики" />
{@render children()}
