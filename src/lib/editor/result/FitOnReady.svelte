<script lang="ts">
  import { useNodesInitialized, useSvelteFlow } from '@xyflow/svelte';

  /**
   * Подгоняет вьюпорт, когда ноды измерены. Кастомные ноды получают размеры
   * асинхронно, поэтому стартового fitView недостаточно.
   */
  let { sig }: { sig: string } = $props();

  const { fitView } = useSvelteFlow();
  const initialized = useNodesInitialized();

  $effect(() => {
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    sig;
    if (initialized.current) {
      void fitView({ padding: 0.15 });
    }
  });
</script>
