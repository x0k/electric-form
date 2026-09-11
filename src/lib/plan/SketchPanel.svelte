<script lang="ts">
  import { Check } from '@lucide/svelte';

  interface Props {
    committed: boolean;
    commitDisabled: boolean;
    onCommit: () => void;
  }

  let { committed, commitDisabled, onCommit }: Props = $props();
</script>

<section class="rounded-box bg-base-200 p-3 text-sm shadow-xl">
  <button
    class="btn btn-sm btn-primary w-full"
    data-testid="commit-layout"
    onclick={onCommit}
    disabled={commitDisabled}
  >
    <Check size={16} />
    {committed ? 'Обновить планировку' : 'Commit планировку'}
  </button>
</section>
