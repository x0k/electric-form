<script lang="ts">
  import { onMount } from 'svelte';
  import {
    SEED_CATALOG,
    COST_CATEGORIES,
    COST_CATEGORY_LABELS,
    DEFAULT_WASTE_PCT,
    type OverrideMap,
  } from '#lib/catalog/index';
  import { loadOverrides, persistOverrides } from '#lib/storage/repo';

  let overrides = $state<OverrideMap>({});
  let query = $state('');

  onMount(() => {
    overrides = loadOverrides();
  });

  function save() {
    persistOverrides($state.snapshot(overrides));
  }

  const q = $derived(query.trim().toLowerCase());
  const groups = $derived(
    COST_CATEGORIES.map((cat) => ({
      cat,
      items: SEED_CATALOG.filter(
        (m) =>
          m.category === cat && (q === '' || m.name.toLowerCase().includes(q))
      ),
    })).filter((g) => g.items.length > 0)
  );

  const changedCount = $derived(Object.keys(overrides).length);

  function effectiveWaste(id: string): number {
    const m = SEED_CATALOG.find((x) => x.id === id);
    if (!m) return 0;
    return (
      overrides[id]?.wastePct ?? m.wastePct ?? DEFAULT_WASTE_PCT[m.category]
    );
  }

  function isChanged(id: string): boolean {
    return id in overrides;
  }

  function setPrice(id: string, raw: number) {
    const seed = SEED_CATALOG.find((m) => m.id === id);
    if (!seed || !Number.isFinite(raw) || raw < 0) return;
    const next = { ...(overrides[id] ?? {}) };
    if (Math.round(raw) === seed.priceRub) delete next.priceRub;
    else next.priceRub = Math.round(raw);
    if (Object.keys(next).length === 0) delete overrides[id];
    else overrides[id] = next;
    save();
  }

  function setWaste(id: string, raw: number | null) {
    const seed = SEED_CATALOG.find((m) => m.id === id);
    if (!seed) return;
    const base = seed.wastePct ?? DEFAULT_WASTE_PCT[seed.category];
    const next = { ...(overrides[id] ?? {}) };
    if (raw === null || !Number.isFinite(raw) || Math.round(raw) === base)
      delete next.wastePct;
    else next.wastePct = Math.min(100, Math.max(0, Math.round(raw)));
    if (Object.keys(next).length === 0) delete overrides[id];
    else overrides[id] = next;
    save();
  }

  function resetOne(id: string) {
    delete overrides[id];
    save();
  }

  function resetAll() {
    overrides = {};
    save();
  }
</script>

<div class="mx-auto w-full max-w-xl px-3 pt-4 pb-8">
  <a class="link link-hover text-sm opacity-70" href="/">← Проекты</a>
  <div class="mt-1 flex items-center gap-2">
    <h1 class="min-w-0 flex-1 truncate text-lg font-bold">
      Каталог материалов
    </h1>
    {#if changedCount > 0}
      <span class="badge badge-primary badge-sm shrink-0"
        >изменено: {changedCount}</span
      >
    {/if}
  </div>
  <p class="mt-1 text-sm opacity-70">
    Цены и запас поверх базового прайса. Применяются во всех расчётах сразу.
  </p>

  <input
    class="input input-bordered mt-3 h-11 w-full"
    type="search"
    placeholder="Поиск…"
    bind:value={query}
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
          <span class="ml-1 text-xs font-normal opacity-60"
            >{g.items.length}</span
          >
        </summary>
        <ul class="space-y-2 px-3 pb-3">
          {#each g.items as m (m.id)}
            <li
              class="rounded-xl bg-base-100 p-3"
              class:outline={isChanged(m.id)}
              class:outline-primary={isChanged(m.id)}
            >
              <div class="flex items-center gap-2">
                <div class="min-w-0 flex-1">
                  <div class="truncate text-sm font-medium">{m.name}</div>
                  <div class="text-xs opacity-60 tabular-nums">
                    база: {m.priceRub} ₽/{m.unit} · запас: {effectiveWaste(
                      m.id
                    )}%
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
                  <span class="label-text py-0.5 text-xs opacity-70"
                    >Цена, ₽</span
                  >
                  <input
                    type="number"
                    class="input input-bordered h-11 w-full"
                    inputmode="numeric"
                    min="0"
                    value={overrides[m.id]?.priceRub ?? m.priceRub}
                    oninput={(e) =>
                      setPrice(m.id, e.currentTarget.valueAsNumber)}
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
                    placeholder={String(effectiveWaste(m.id))}
                    value={overrides[m.id]?.wastePct ?? ''}
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
</div>
