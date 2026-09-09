<script lang="ts">
  let {
    label,
    checked = $bindable(false),
    hint = '',
  }: { label: string; checked: boolean; hint?: string } = $props();
</script>

<div class="form-control">
  <label class="label cursor-pointer justify-start gap-3">
    <input type="checkbox" class="toggle toggle-primary" bind:checked />
    <span class="label-text">{label}</span>
  </label>
  {#if hint}
    <p class="pl-1 text-xs opacity-60">{hint}</p>
  {/if}
</div>
