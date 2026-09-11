<script lang="ts">
  import {
    cameraModeLabel,
    EDITOR_CAMERA_MODES,
    type EditorCameraMode,
  } from './camera';
  import { SNAP_STEPS_MM } from './geometry';

  interface Props {
    cameraMode: EditorCameraMode;
    snapStepMm: number;
    showGrid: boolean;
    previewIndex: number | null;
    showSnap?: boolean;
    onCameraMode: (mode: EditorCameraMode) => void;
    onSnapStep: (stepMm: number) => void;
    onShowGrid: (value: boolean) => void;
    onBackToHead: () => void;
  }

  let {
    cameraMode,
    snapStepMm,
    showGrid,
    previewIndex,
    showSnap = true,
    onCameraMode,
    onSnapStep,
    onShowGrid,
    onBackToHead,
  }: Props = $props();
</script>

<div
  class="flex flex-wrap items-center gap-2"
  role="toolbar"
  aria-label="Редактор"
>
  {#each EDITOR_CAMERA_MODES as mode (mode)}
    <button
      class="btn btn-sm"
      class:btn-primary={cameraMode === mode}
      data-testid="cam-{mode}"
      onclick={() => onCameraMode(mode)}
    >
      {cameraModeLabel(mode)}
    </button>
  {/each}
  {#if showSnap}
    <label class="ml-2 flex items-center gap-1 text-sm">
      Шаг:
      <select
        class="select select-sm select-bordered"
        value={snapStepMm}
        onchange={(e) => onSnapStep(Number(e.currentTarget.value))}
      >
        {#each SNAP_STEPS_MM as step (step)}
          <option value={step}>
            {step >= 10 ? `${step / 10} см` : `${step} мм`}
          </option>
        {/each}
      </select>
    </label>
  {/if}
  <label class="flex cursor-pointer items-center gap-1 text-sm">
    <input
      type="checkbox"
      class="checkbox checkbox-sm"
      checked={showGrid}
      onchange={(e) => onShowGrid(e.currentTarget.checked)}
    />
    Сетка
  </label>
  {#if previewIndex !== null}
    <span class="badge badge-warning ml-2">
      Просмотр Feature {previewIndex + 1} — история не изменяется
    </span>
    <button class="btn btn-sm" onclick={onBackToHead}>К голове</button>
  {/if}
</div>
