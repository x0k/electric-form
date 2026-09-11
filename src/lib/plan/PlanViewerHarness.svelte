<script lang="ts">
  import PlanViewer from './PlanViewer.svelte';
  import { buildSampleFlat } from './sample';
  import { modelToScene } from './render';

  const scene = modelToScene(buildSampleFlat());
  let selectedId: string | null = $state(null);
  let lastNotified: string | null = $state(null);
</script>

<div style="width: 640px; height: 480px;">
  <PlanViewer
    {scene}
    {selectedId}
    onSelect={(id) => {
      lastNotified = id;
      selectedId = id;
    }}
  />
</div>
<button data-testid="pick-w1" onclick={() => (selectedId = 'w1')}>
  Выбрать w1
</button>
<p data-testid="selected-label">{selectedId ?? 'ничего'}</p>
<p data-testid="notified-label">{lastNotified ?? '—'}</p>
