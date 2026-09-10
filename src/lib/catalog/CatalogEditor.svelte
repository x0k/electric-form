<script lang="ts">
  import {
    COST_CATEGORIES,
    COST_CATEGORY_LABELS,
    DEFAULT_WASTE_PCT,
    type Material,
    type OverrideMap,
  } from '#lib/catalog/index';
  import {
    resetAllCatalogOverrides,
    resetCatalogOverride,
    setCatalogOverride,
  } from '#lib/catalog.remote';

  type DraftValue = { priceRub?: number; wastePct?: number } | null;

  let {
    base,
    serverOverrides,
  }: {
    base: Material[];
    serverOverrides: OverrideMap;
  } = $props();

  /** Локальные правки поверх серверного состояния (seq защищает от гонок). */
  let drafts = $state<Record<string, { value: DraftValue; seq: number }>>({});
  let seq = 0;
  let search = $state('');

  /** Видимые overrides: серверные + локальные черновики (null = сброс). */
  const merged = $derived.by(() => {
    const m: Record<string, { priceRub?: number; wastePct?: number }> = {};
    for (const [id, o] of Object.entries(serverOverrides)) m[id] = o;
    for (const [id, d] of Object.entries(drafts)) {
      if (d.value == null) delete m[id];
      else m[id] = d.value;
    }
    return m;
  });

  const changedCount = $derived(Object.keys(merged).length);

  function visible(id: string): { priceRub?: number; wastePct?: number } {
    return merged[id] ?? {};
  }

  const q = $derived(search.trim().toLowerCase());
  const groups = $derived(
    COST_CATEGORIES.map((cat) => ({
      cat,
      items: base.filter(
        (m) =>
          m.category === cat && (q === '' || m.name.toLowerCase().includes(q))
      ),
    })).filter((g) => g.items.length > 0)
  );

  function effectiveWaste(m: Material): number {
    const o = visible(m.id);
    return o.wastePct ?? m.wastePct ?? DEFAULT_WASTE_PCT[m.category];
  }

  function isChanged(id: string): boolean {
    return id in merged;
  }

  async function save(
    id: string,
    value: DraftValue | undefined,
    mySeq: number
  ) {
    try {
      if (value === null || value === undefined) await resetCatalogOverride(id);
      else await setCatalogOverride({ id, override: value });
    } catch {
      alert('Не удалось сохранить изменение');
    } finally {
      if (drafts[id]?.seq === mySeq) delete drafts[id];
    }
  }

  function stage(id: string, value: DraftValue | undefined) {
    seq += 1;
    const mySeq = seq;
    if (value === undefined) delete drafts[id];
    else drafts[id] = { value, seq: mySeq };
    void save(id, value, mySeq);
  }

  function setPrice(id: string, raw: number) {
    const seed = base.find((m) => m.id === id);
    if (!seed || !Number.isFinite(raw) || raw < 0) return;
    const next: { priceRub?: number; wastePct?: number } = {
      ...visible(id),
    };
    if (Math.round(raw) === seed.priceRub) delete next.priceRub;
    else next.priceRub = Math.round(raw);
    stage(id, Object.keys(next).length === 0 ? undefined : next);
  }

  function setWaste(id: string, raw: number | null) {
    const seed = base.find((m) => m.id === id);
    if (!seed) return;
    const baseWaste = seed.wastePct ?? DEFAULT_WASTE_PCT[seed.category];
    const next: { priceRub?: number; wastePct?: number } = {
      ...visible(id),
    };
    if (raw === null || !Number.isFinite(raw) || Math.round(raw) === baseWaste)
      delete next.wastePct;
    else next.wastePct = Math.min(100, Math.max(0, Math.round(raw)));
    stage(id, Object.keys(next).length === 0 ? undefined : next);
  }

  function resetOne(id: string) {
    stage(id, undefined);
  }

  async function resetAll() {
    drafts = {};
    try {
      await resetAllCatalogOverrides();
    } catch {
      alert('Не удалось сбросить изменения');
    }
  }
</script>

<div class="flex items-center gap-2">
  <p class="min-w-0 flex-1 text-sm opacity-70">
    Цены и запас поверх базового прайса. Применяются во всех расчётах сразу.
  </p>
  {#if changedCount > 0}
    <span class="badge badge-primary badge-sm shrink-0"
      >изменено: {changedCount}</span
    >
  {/if}
</div>

<input
  class="input input-bordered mt-3 h-11 w-full"
  type="search"
  placeholder="Поиск…"
  bind:value={search}
/>

{#if changedCount > 0}
  <button class="btn btn-ghost btn-sm mt-2" onclick={resetAll}>
    Сбросить все изменения
  </button>
{/if}

<div class="mt-2 space-y-2">
  {#each groups as g (g.cat)}
    <details class="card bg-base-200" open={q !== ''}>
      <summary class="cursor-pointer p-3 font-semibold">
        {COST_CATEGORY_LABELS[g.cat]}
        <span class="ml-1 text-xs font-normal opacity-60">{g.items.length}</span
        >
      </summary>
      <ul class="space-y-2 px-3 pb-3">
        {#each g.items as m (m.id)}
          {const o = visible(m.id)}
          <li
            class="rounded-xl bg-base-100 p-3"
            class:outline={isChanged(m.id)}
            class:outline-primary={isChanged(m.id)}
          >
            <div class="flex items-center gap-2">
              <div class="min-w-0 flex-1">
                <div class="truncate text-sm font-medium">{m.name}</div>
                <div class="text-xs opacity-60 tabular-nums">
                  база: {m.priceRub} ₽/{m.unit} · запас: {effectiveWaste(m)}%
                </div>
              </div>
              {#if isChanged(m.id)}
                <button
                  class="btn btn-ghost btn-sm shrink-0"
                  aria-label="Сбросить {m.name}"
                  onclick={() => resetOne(m.id)}>↺</button
                >
              {/if}
            </div>
            <div class="mt-2 grid grid-cols-2 gap-2">
              <label class="form-control">
                <span class="label-text py-0.5 text-xs opacity-70">Цена, ₽</span
                >
                <input
                  type="number"
                  class="input input-bordered h-11 w-full"
                  inputmode="numeric"
                  min="0"
                  value={o.priceRub ?? m.priceRub}
                  oninput={(e) => setPrice(m.id, e.currentTarget.valueAsNumber)}
                />
              </label>
              <label class="form-control">
                <span class="label-text py-0.5 text-xs opacity-70"
                  >Запас, %</span
                >
                <input
                  type="number"
                  class="input input-bordered h-11 w-full"
                  inputmode="numeric"
                  min="0"
                  max="100"
                  placeholder={String(effectiveWaste(m))}
                  value={o.wastePct ?? ''}
                  oninput={(e) =>
                    setWaste(
                      m.id,
                      e.currentTarget.value === ''
                        ? null
                        : e.currentTarget.valueAsNumber
                    )}
                />
              </label>
            </div>
          </li>
        {/each}
      </ul>
    </details>
  {/each}
</div>

{#if groups.length === 0}
  <div class="alert mt-4 text-sm"><span>Ничего не найдено.</span></div>
{/if}
