<script lang="ts">
  import {
    getCatalogData,
    getPriceData,
    getRefreshStatus,
    refreshPrices,
  } from '#lib/catalog.remote';

  // Live-статус фонового обновления цен: обновляется сам, пока открыт каталог.
  const status = $derived(await getRefreshStatus());
  const run = $derived(status.run);
  const running = $derived(run?.status === 'running');
  // Живой прогон блокирует кнопку; зависший (stale) можно перезапустить.
  const busy = $derived(running && !status.stale);

  let err = $state('');
  let wasLive = $state(false);

  // По завершении живого прогона подтягиваем свежие офферы и рыночный min.
  $effect(() => {
    if (busy) {
      wasLive = true;
    } else if (wasLive) {
      wasLive = false;
      void getPriceData().refresh();
      void getCatalogData().refresh();
    }
  });

  function fmtDate(iso: string | null | undefined): string {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  /** Возраст heartbeat в минутах (null — нет данных). */
  function beatAgeMin(): number | null {
    const beat = run?.lastBeatAt ?? run?.startedAt;
    if (!beat) return null;
    return Math.max(
      0,
      Math.round((Date.now() - new Date(beat).getTime()) / 60000)
    );
  }

  async function refresh() {
    if (busy) return;
    err = '';
    try {
      await refreshPrices();
    } catch (e) {
      err = e instanceof Error ? e.message : 'Не удалось обновить цены';
    }
  }
</script>

<div class="card bg-base-200 mb-3">
  <div class="flex flex-wrap items-center gap-2 p-3">
    <div class="min-w-0 flex-1 text-sm">
      <div class="font-medium">Рыночные цены · Сыктывкар</div>
      <div class="text-xs opacity-60 tabular-nums">
        {#if run}
          {#if busy}
            обновление цен: {run.doneCount ?? 0}/{run.totalCount ?? '…'} · heartbeat
            {beatAgeMin() ?? 0} мин назад…
          {:else if running && status.stale}
            похоже завис (нет heartbeat {beatAgeMin() ?? '?'} мин) — можно перезапустить
          {:else}
            последний прогон: {fmtDate(run.finishedAt ?? run.startedAt)} · статус:
            {run.status}{run.error ? ` · ${run.error}` : ''}
          {/if}
        {:else}
          парсер ещё не запускался
        {/if}
      </div>
      {#if busy && run?.totalCount}
        <progress
          class="progress progress-primary mt-2 w-full"
          value={run.doneCount ?? 0}
          max={run.totalCount}
        ></progress>
      {/if}
      {#if run?.status === 'partial' || run?.status === 'error' || run?.status === 'timeout'}
        <div class="mt-1 text-xs opacity-60">
          Часть офферов сохранена (см. ниже). Подробности ошибок — в docker logs
          парсера.
        </div>
      {/if}
    </div>
    <button
      class="btn btn-primary btn-sm shrink-0"
      disabled={busy}
      onclick={refresh}
    >
      {#if busy}
        <span class="loading loading-spinner loading-xs"></span>
      {/if}
      {busy
        ? 'Обновление…'
        : running && status.stale
          ? 'Перезапустить'
          : 'Обновить цены'}
    </button>
  </div>
  {#if err}
    <div class="alert alert-error mx-3 mb-3 text-sm whitespace-pre-line">
      <span>{err}</span>
    </div>
  {/if}
</div>
