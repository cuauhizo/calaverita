<script setup>
import { onMounted, onUnmounted, ref } from 'vue'

// Definir breakpoints de Tailwind CSS
const breakpoints = {
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  '2xl': 1536,
}

// Refs para el elemento y el texto
const tag = ref(null)
const currentSize = ref('xs')

function updateScreenSize() {
  const width = window.innerWidth
  let size = 'xs'

  if (width >= breakpoints['2xl']) size = '2xl'
  else if (width >= breakpoints.xl) size = 'xl'
  else if (width >= breakpoints.lg) size = 'lg'
  else if (width >= breakpoints.md) size = 'md'
  else if (width >= breakpoints.sm) size = 'sm'

  currentSize.value = size

  // Mostrar u ocultar la etiqueta según el tamaño
  if (tag.value) {
    tag.value.classList.toggle('hidden', size === 'xs')
  }
}

onMounted(() => {
  updateScreenSize()
  window.addEventListener('resize', updateScreenSize)
})

onUnmounted(() => {
  window.removeEventListener('resize', updateScreenSize)
})
</script>

<template>
  <!-- Contenedor de la etiqueta -->
  <div ref="tag" class="fixed bottom-2 left-2 px-4 py-2 text-white bg-blue-500 rounded-lg shadow-lg hidden z-50">
    <span>{{ currentSize }}</span>
  </div>
</template>

<style scoped></style>
