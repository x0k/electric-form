<script lang="ts">
  import { refreshPrices } from '#lib/catalog.remote';
  import type { PriceRun } from '#lib/server/db/prices';

  let { run }: { run: PriceRun | null } = $props();

  let busy = $state(false);
  let err = $state('');

  function fmtDate(iso: string | null): string {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  async function refresh() {
    if (busy) return;
    busy = true;
    err = '';
    try {
      await refreshPrices();
    } catch (e) {
      err = e instanceof Error ? e.message : 'Не удалось обновить цены';
    } finally {
      busy = false;
    }
  }
</script>

<div class="card bg-base-200 mb-3">
  <div class="flex flex-wrap items-center gap-2 p-3">
    <div class="min-w-0 flex-1 text-sm">
      <div class="font-medium">Рыночные цены · Сыктывкар</div>
      <div class="text-xs opacity-60 tabular-nums">
        {#if run}
          последний прогон: {fmtDate(run.finishedAt ?? run.startedAt)} · статус: {run.status}{run.error
            ? ` · ${run.error}`
            : ''}
        {:else}
          парсер ещё не запускался
        {/if}
      </div>
    </div>
    <button
      class="btn btn-primary btn-sm shrink-0"
      disabled={busy}
      onclick={refresh}
    >
      {#if busy}
        <span class="loading loading-spinner loading-xs"></span>
      {/if}
      Обновить цены
    </button>
  </div>
  {#if err}
    <div class="alert alert-error mx-3 mb-3 text-sm whitespace-pre-line">
      <span>{err}</span>
    </div>
  {/if}
</div>
