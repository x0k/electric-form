<script lang="ts">
  import PlanViewer from './PlanViewer.svelte';
  import { buildSampleFlat } from './sample';
  import { modelToScene } from './render';
  import {
    createSketch,
    sketchClose,
    sketchMovePoint,
    sketchPolylineAdd,
    type Sketch,
  } from './sketch';
  import type { EditorCameraMode } from './camera';
  import type { Vec2 } from './geometry';

  const scene = modelToScene(buildSampleFlat());
  let cameraMode: EditorCameraMode = $state('orbit');
  let selectedId: string | null = $state(null);
  let lastPlan: Vec2 | null = $state(null);

  function buildRect(): Sketch {
    let s = createSketch();
    const pts = [
      ['p1', 0, 0],
      ['p2', 6000, 0],
      ['p3', 6000, 4000],
      ['p4', 0, 4000],
    ] as const;
    let n = 0;
    for (const [pid, x, y] of pts) {
      const r = sketchPolylineAdd(
        s,
        pid,
        { x, y },
        pid === 'p1' ? null : `s${(n += 1)}`
      );
      if (r.ok) s = r.value.sketch;
    }
    const closed = sketchClose(s, 's4');
    if (closed.ok) s = closed.value;
    return s;
  }

  let sketch: Sketch = $state(buildRect());

  function applyMove(pointId: string, plan: Vec2) {
    const r = sketchMovePoint(sketch, pointId, plan);
    if (r.ok) sketch = r.value.sketch;
  }

  /** Клик мимо модели, рядом с (-640, 4720), со снаппингом 1 см. */
  function isPlanOk(p: Vec2 | null): boolean {
    if (p === null) return false;
    return (
      Math.abs(p.x - -640) <= 15 &&
      Math.abs(p.y - 4720) <= 15 &&
      p.x % 10 === 0 &&
      p.y % 10 === 0 &&
      (p.x < 0 || p.y < 0 || p.x > 6000 || p.y > 4000)
    );
  }

  const planOk = $derived(isPlanOk(lastPlan));
</script>

<div style="width: 640px; height: 480px;">
  <PlanViewer
    {scene}
    selectedIds={selectedId ? [selectedId] : []}
    {cameraMode}
    {sketch}
    onSelect={(id) => (selectedId = id)}
    onPlanClick={(p) => (lastPlan = p)}
    onSketchPointMove={applyMove}
    onSketchPointCommit={applyMove}
  />
</div>
<div>
  <button data-testid="cam-top" onclick={() => (cameraMode = 'top')}
    >Сверху</button
  >
  <button data-testid="cam-iso" onclick={() => (cameraMode = 'iso')}>Изо</button
  >
  <button data-testid="cam-orbit" onclick={() => (cameraMode = 'orbit')}
    >Орбита</button
  >
</div>
<p data-testid="selected-label">{selectedId ?? 'ничего'}</p>
<p data-testid="plan-label" data-ok={planOk ? 'true' : 'false'}>
  {lastPlan ? `${lastPlan.x}, ${lastPlan.y}` : '—'}
</p>
<p data-testid="sketch-p2">{sketch.points['p2']?.x ?? '—'}</p>
