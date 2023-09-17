<template>
  <button :class="type === 'primary'? 'text-cyan':'text-amber'"><slot /></button>
</template>

<script lang="ts" setup>
defineOptions({ name: "WQButton" });
export type ButtonProps = {
  type?: "primary" | "success" | "warning" | "danger" | "info" | "text";
};
const buttonProps = withDefaults(defineProps<ButtonProps>(), {
  type: "primary",
});
</script>