<script lang="ts">
  import { getInput } from '@formisch/svelte';
  import * as v from 'valibot';
  import { SEED_CATALOG, applyOverrides } from '#lib/catalog/index';
  import { calculate } from '#lib/calc/engine';
  import { calcSavings } from '#lib/calc/savings';
  import { createProjectForm } from '#lib/forms/ctx';
  import { createDefaultProject } from '#lib/project/defaults';
  import { ProjectSchema } from '#lib/project/schemas';
  import ResultView from './ResultView.svelte';

  const form = createProjectForm(createDefaultProject('Тест'));
  const catalog = applyOverrides(SEED_CATALOG, {});
  // Как в шелле EditorForm: итог — из валидного выхода стора.
  const liveInput = $derived(getInput(form));
  const parsed = $derived(v.safeParse(ProjectSchema, liveInput));
  const view = $derived(
    parsed.success ? parsed.output : createDefaultProject('Тест')
  );
  const result = $derived(calculate(view, catalog));
  const savings = $derived(calcSavings(view, catalog));
</script>

<ResultView {form} {view} {result} {savings} overriddenCount={0} />
