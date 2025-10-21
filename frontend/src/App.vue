<script setup>
// Importamos 'ref' de Vue para la reactividad
import { ref } from 'vue';
// Importamos Axios para las peticiones HTTP
import axios from 'axios';

// 1. Refs para los datos del formulario
const nombre = ref('');
const gustos = ref('');
const profesion = ref('');

// 2. Refs para manejar el estado de la UI
const calaveraGenerada = ref('');
const estaCargando = ref(false);
const error = ref(null);

// 3. URL del Backend
const API_URL = 'http://localhost:3000/api/generar-calavera';

// 4. Función que se llama al enviar el formulario
const handleSubmit = async () => {
  // Reiniciar estado
  estaCargando.value = true;
  calaveraGenerada.value = '';
  error.value = null;

  try {
    // 5. Llamada de Axios al backend
    const response = await axios.post(API_URL, {
      nombre: nombre.value,
      gustos: gustos.value,
      profesion: profesion.value,
    });

    // 6. Actualizar el ref con la respuesta
    calaveraGenerada.value = response.data.calavera;

  } catch (err) {
    // 7. Manejo de error
    error.value = '¡Ups! No se pudo generar la calavera.';
    console.error(err);
  } finally {
    // 8. Quitar el estado de carga
    estaCargando.value = false;
  }
};
</script>

<template>
  <div class="min-h-screen bg-gray-900 text-white p-10">
    <div class="max-w-2xl mx-auto">
      <h1 class="text-4xl font-bold text-center mb-8 text-orange-400">Generador de Calaveritas 💀</h1>

      <form @submit.prevent="handleSubmit" class="space-y-4">
        <div>
          <label for="nombre" class="block text-sm font-medium text-gray-300">Nombre:</label>
          <input v-model="nombre" type="text" id="nombre"
            class="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md shadow-sm p-2 text-white" required>
        </div>

        <div>
          <label for="profesion" class="block text-sm font-medium text-gray-300">Profesión:</label>
          <input v-model="profesion" type="text" id="profesion"
            class="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md shadow-sm p-2 text-white">
        </div>

        <div>
          <label for="gustos" class="block text-sm font-medium text-gray-300">Gustos y Hobbies:</label>
          <textarea v-model="gustos" id="gustos" rows="3"
            class="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md shadow-sm p-2 text-white"></textarea>
        </div>

        <button type="submit" :disabled="estaCargando"
          class="w-full py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-orange-600 hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500 disabled:opacity-50">
          {{ estaCargando ? 'Generando...' : '¡Generar Calaverita!' }}
        </button>
      </form>

      <div v-if="error" class="mt-6 p-4 bg-red-800 text-red-100 rounded-md">
        {{ error }}
      </div>

      <div v-if="calaveraGenerada" class="mt-6 p-6 bg-gray-800 rounded-lg shadow-lg">
        <h2 class="text-2xl font-semibold mb-4 text-orange-400">¡Aquí está tu calavera!</h2>
        <p class="text-gray-200 whitespace-pre-line">{{ calaveraGenerada }}</p>
      </div>
    </div>
  </div>
</template>