<template>
  <button class="text-red-500 bg-slate test"><slot /></button>
</template>

<script lang="ts" setup>
defineOptions({ name: "test-button" });
type ButtonProps = {
  type?: string;
};
const buttonProps = defineProps<ButtonProps>();
</script>