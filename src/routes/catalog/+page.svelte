<script lang="ts">
  import { getCatalogData, getPriceData } from '#lib/catalog.remote';
  import CatalogEditor from '#lib/catalog/CatalogEditor.svelte';
  import MarketPricesPanel from '#lib/catalog/MarketPricesPanel.svelte';
</script>

<div class="mx-auto w-full max-w-xl px-4 pt-4 pb-8">
  <svelte:boundary>
    {const data = $derived(await getCatalogData())}
    {const prices = $derived(await getPriceData())}
    <MarketPricesPanel run={prices.run} />
    <CatalogEditor
      base={data.base}
      serverOverrides={data.overrides}
      market={data.market}
      offers={prices.offersByMaterial}
    />

    {#snippet pending()}
      <div class="space-y-2">
        {#each Array(6) as _, i (i)}
          <div class="skeleton h-16 w-full"></div>
        {/each}
      </div>
    {/snippet}

    {#snippet failed(_, retry)}
      <div class="alert alert-error mt-4 text-sm">
        <span>Не удалось загрузить каталог.</span>
        <button class="btn btn-sm" onclick={retry}>Повторить</button>
      </div>
    {/snippet}
  </svelte:boundary>
</div>
