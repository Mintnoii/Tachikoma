<template>
  <button class="my-button" :class="buttonStyle"><slot /></button>
</template>

<script lang="ts" setup>
import { computed } from "vue";
defineOptions({ name: "my-button" });
type ButtonProps = {
  type?: string;
};
const buttonProps = defineProps<ButtonProps>();

const buttonStyle = computed(() => {
  return { [`my-button--${buttonProps.type}`]: buttonProps.type };
});
</script>


<style lang="scss" scoped>
@import './index.scss';
</style>