<script setup>
import { ref, onMounted, watch, computed } from 'vue';
import axios from 'axios';
import html2canvas from 'html2canvas';
import { useGtag } from 'vue-gtag-next'

// 1. Refs para los datos del formulario
const nombre = ref('');
const gustos = ref('');
const profesion = ref('');
const imagenFondoResultadoActual = ref(1);
const email = ref('');
const tono = ref('humorístico');
const puesto = ref('');
const galeria = ref([]);
const galeriaItemRefs = ref({});
const setGaleriaItemRef = (el, itemId) => {
  if (el) {
    // Si el elemento existe (se monta o actualiza), lo guardamos/actualizamos
    galeriaItemRefs.value[itemId] = el;
  } else {
    // Si 'el' es null, significa que el elemento se está desmontando
    // Lo eliminamos de nuestro objeto de refs
    if (galeriaItemRefs.value[itemId]) {
      delete galeriaItemRefs.value[itemId];
    }
  }
};

// 2. Refs para manejar el estado de la UI
const calaveraGenerada = ref('');
const lastGeneratedId = ref(null);
const showCurrentResult = ref(false);
const estaCargando = ref(false);
const error = ref(null);
const resultadoActualDivRef = ref(null);
const { event } = useGtag()
const downloadError = ref(null);
const emailDomainError = ref(null);

// --- Leer dominios permitidos del frontend .env ---
const allowedFrontendDomains = (import.meta.env.VITE_ALLOWED_DOMAINS || '')
  .split(',')
  .map(domain => domain.trim().toLowerCase())
  .filter(domain => domain);

// 3. URL del Backend
const API_URL = `${import.meta.env.VITE_API_URL}/generar-calavera`;
const GALERIA_URL = `${import.meta.env.VITE_GALERIA_URL}/calaveras`;

// --- Función para validar el dominio del email ---
const validateEmailDomain = () => {
  emailDomainError.value = null;
  if (email.value && isValidEmail(email.value)) {
    const domain = getDomainFromEmail(email.value);
    if (!allowedFrontendDomains.includes(domain)) {
      emailDomainError.value = 'Lo sentimos, el correo que ingresaste no pertenece a la empresa, intenta de nuevo con un correo válido.';
    }
  } else if (email.value) {
    // Si hay algo escrito pero no es un email válido aún
    emailDomainError.value = 'Formato de correo inválido.';
  }
};

// 4. Función que se llama al enviar el formulario
const handleSubmit = async () => {

  // Re-validar formato y dominio antes de enviar
  validateEmailDomain();
  if (!email.value || !isValidEmail(email.value) || emailDomainError.value) {
    error.value = emailDomainError.value || 'Por favor, ingresa un correo electrónico válido y autorizado.';
    return; // Detener si hay error de email o dominio
  }

  // Reiniciar estado
  estaCargando.value = true;
  calaveraGenerada.value = '';
  error.value = null;
  showCurrentResult.value = false;
  lastGeneratedId.value = null;

  try {

    if (!isValidEmail(email.value)) {
      error.value = 'Por favor, ingresa un correo electrónico válido.';
      estaCargando.value = false;
      return; // Detener si el email no es válido
    }
    const domainToSend = getDomainFromEmail(email.value);

    // 5. Llamada de Axios al backend
    const response = await axios.post(API_URL, {
      nombre: nombre.value,
      gustos: gustos.value,
      profesion: profesion.value,
      email: email.value,
      tono: tono.value,
      puesto: puesto.value,
      empresa: domainToSend,
    });

    // 6. Actualizar el ref con la respuesta
    calaveraGenerada.value = response.data.calavera;
    imagenFondoResultadoActual.value = response.data.imagenFondoId;
    lastGeneratedId.value = response.data.id;
    showCurrentResult.value = true;

    // --- Enviar evento a GA4 ---
    event('generate_calaverita', {
      'event_category': 'engagement',
      'event_label': `Tono: ${tono.value}`,
      'company_domain': domainToSend,
      'value': 1
    })


    // ---- Cargar galería personal DESPUÉS de generar ----
    // Usamos el email que ya está en el ref
    cargarGaleria(email.value);

  } catch (err) {
    // 7. Manejo de error MEJORADO
    console.error(err);
    // Intenta leer el mensaje de error que viene del backend
    if (err.response && err.response.data && err.response.data.error) {
      error.value = err.response.data.error; // Ej: "Error al generar la calavera"
    } else {
      error.value = 'Error de conexión. ¿El servidor está corriendo?';
    }
  } finally {
    // 8. Quitar el estado de carga
    estaCargando.value = false;
  }
};

// 3. Función para cargar la galería
const cargarGaleria = async (correoUsuario) => {
  if (!correoUsuario || !isValidEmail(correoUsuario)) { // 2. No cargar si no hay email válido
    galeria.value = []; // Limpiar galería si el email no es válido
    return;
  }
  try {
    // ---- MODIFICADO: Añadir el email como query parameter ----
    const response = await axios.get(GALERIA_URL, { params: { email: correoUsuario } });
    galeria.value = response.data;
  } catch (err) {
    console.error("Error cargando la galería personal", err);
    // Podrías mostrar un mensaje si falla la carga (ej. email inválido según backend)
    if (err.response && err.response.status === 400) {
      // Quizás mostrar un pequeño mensaje indicando que el email no es válido para la galería
    }
    galeria.value = []; // Limpiar en caso de error
  }
};

// Función para descargar la imagen del resultado ACTUAL
const descargarImagenActual = async () => {
  if (!resultadoActualDivRef.value) return;
  await generarYDescargarCanvas(resultadoActualDivRef.value, `calaverita_${nombre.value || 'generada'}.png`);
};

// --- NUEVO: Función para descargar imagen de la GALERÍA ---
const descargarImagenGaleria = async (calavera) => {
  const elemento = galeriaItemRefs.value[calavera.id]; // Busca el elemento por su ID
  if (!elemento) {
    console.error(`No se encontró el elemento para el ID ${calavera.id}`);
    return;
  }
  await generarYDescargarCanvas(elemento, `calaverita_${calavera.nombre}_${calavera.id}.png`);
};

// --- NUEVO: Función reutilizable para generar y descargar ---
const generarYDescargarCanvas = async (elementoDOM, nombreArchivo) => {
  try {
    const canvas = await html2canvas(elementoDOM, { useCORS: true, logging: false });
    const imageURL = canvas.toDataURL('image/png');
    const link = document.createElement('a');
    link.href = imageURL;
    link.download = nombreArchivo;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    // --- Enviar evento a GA4 ---
    event('download_image', {
      'event_category': 'engagement',
      'event_label': nombreArchivo,
    });

  } catch (error) {
    console.error('Error al generar la imagen:', error);
    downloadError.value = 'No se pudo generar la imagen para descargar. Intenta de nuevo.';
    setTimeout(() => { downloadError.value = null; }, 5000);
  }
};

const galeriaFiltrada = computed(() => {
  // Si no hay un ID recién generado, muestra toda la galería
  if (!lastGeneratedId.value) {
    return galeria.value;
  }
  // Si hay un ID recién generado, filtra ese item
  return galeria.value.filter(item => item.id !== lastGeneratedId.value);
});

// Función para extraer el dominio principal de un email
const getDomainFromEmail = (emailString) => {
  if (!emailString || !emailString.includes('@')) {
    return ''; // Retorna vacío si no es un email válido
  }
  const domainPart = emailString.split('@')[1];
  // Esta versión simple solo toma el dominio completo después del @
  return domainPart || '';
};

// ---- Observar cambios en el email para cargar la galería personal ----
watch(email, (newEmail) => {
  // Validar dominio al cambiar el email
  validateEmailDomain();

  showCurrentResult.value = false;
  lastGeneratedId.value = null;
  if (newEmail && isValidEmail(newEmail) && !emailDomainError.value) {
    cargarGaleria(newEmail);
  } else {
    galeria.value = [];
  }
});

// --- Helper de validación de email (simple) en el frontend ---
function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}
</script>

<template>
  <div class="min-h-screen bg-gray-900 text-white flex flex-col">
    <div class="max-w-2xl mx-auto w-full flex-grow px-4 md:px-10 py-10">
      <h1 class="text-4xl font-bold text-center mb-8 text-orange-400">Generador de Calaveritas Literarias 💀</h1>

      <form @submit.prevent="handleSubmit" class="space-y-4">
        <div>
          <label for="email" class="block text-sm font-medium text-gray-300">Escribe tu correo electrónico
            corporativo:</label>
          <input v-model="email" type="email" id="email" @blur="validateEmailDomain"
            class="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md shadow-sm p-2 text-white"
            :class="{ 'border-red-500': emailDomainError }" required>
          <p v-if="emailDomainError" class="mt-1 text-sm text-red-400">
            {{ emailDomainError }}
          </p>
        </div>

        <div>
          <label for="nombre" class="block text-sm font-medium text-gray-300">¿Cómo te llamas?</label>
          <input v-model="nombre" type="text" id="nombre"
            class="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md shadow-sm p-2 text-white" required>
        </div>

        <div>
          <label for="profesion" class="block text-sm font-medium text-gray-300">¿Cuál es tu profesión?</label>
          <input v-model="profesion" type="text" id="profesion"
            class="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md shadow-sm p-2 text-white">
        </div>

        <div>
          <label for="puesto" class="block text-sm font-medium text-gray-300">¿Qué puesto de trabajo tienes?</label>
          <input v-model="puesto" type="text" id="puesto"
            class="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md shadow-sm p-2 text-white">
        </div>

        <div>
          <label for="gustos" class="block text-sm font-medium text-gray-300">¿Qué actividades disfrutas
            realizar?</label>
          <textarea v-model="gustos" id="gustos" rows="2"
            class="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md shadow-sm p-2 text-white"></textarea>
        </div>

        <div>
          <label for="tono" class="block text-sm font-medium text-gray-300">¿Qué vibra quieres que tenga tu calaverita?
          </label>
          <select v-model="tono" id="tono"
            class="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md shadow-sm p-2 text-white">
            <option value="humorístico">Humorístico</option>
            <option value="sarcástico">Sarcástico</option>
            <option value="tierno">Tierno</option>
            <option value="melancólico">Melancólico</option>
            <option value="respetuoso">Respetuoso</option>
          </select>
        </div>
        <button type="submit" :disabled="estaCargando"
          class="w-full py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-orange-600 hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
          style="min-height: 38px;">
          <svg v-if="estaCargando" class="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg"
            fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z">
            </path>
          </svg>
          <span v-if="!estaCargando">¡Generar Calaverita!</span>
          <span v-if="estaCargando">Generando...</span>
        </button>
      </form>

      <div v-if="error" class="mt-6 p-4 bg-red-800 text-red-100 rounded-md">
        {{ error }}
      </div>
      <div v-if="downloadError" class="mt-6 p-4 bg-red-800 text-red-100 rounded-md">{{ downloadError }}</div>

      <div v-if="calaveraGenerada && showCurrentResult" class="mt-6">
        <div class="block sm:hidden my-6 p-4 bg-green-100 text-green-900  rounded-md" role="alert">
          <p class="text-sm text-center">Gira tu dispositivo para una mejor descarga de tu imagen</p>
        </div>
        <div ref="resultadoActualDivRef"
          class="relative w-full max-w-xl mx-auto aspect-[2/3] rounded-lg shadow-lg overflow-hidden">
          <img :src="`/fondo_${imagenFondoResultadoActual}.png`" alt="Fondo Calaverita"
            class="absolute inset-0 w-full h-full object-cover">
          <div class="absolute inset-0"></div>
          <div
            class="absolute inset-0 p-8 sm:p-14 md:p-10 lg:p-16 z-10 overflow-y-auto text-center flex flex-col justify-center mt-16 sm:mt-28 md:mt-20">
            <div>
              <p class="text-gray-100 whitespace-pre-line text-sm sm:text-base">
                {{ calaveraGenerada }}
              </p>
            </div>
          </div>
        </div>
        <button @click="descargarImagenActual"
          class="mt-4 w-full max-w-xl mx-auto block py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500">
          Descargar Imagen
        </button>
      </div>
      <div v-if="email && isValidEmail(email) && galeriaFiltrada.length > 0" class="mt-10">
        <div class="block sm:hidden my-6 p-4 bg-green-100 text-green-900  rounded-md" role="alert">
          <p class="text-sm text-center">Gira tu dispositivo para una mejor descarga de tu imagen</p>
        </div>
        <h2 class="text-2xl font-semibold mb-4 text-orange-400">Tus Calaveritas Generadas</h2>
        <template v-for="calavera in galeriaFiltrada" :key="calavera.id">
          <div class="mb-8">
            <div :ref="(el) => setGaleriaItemRef(el, calavera.id)"
              class="relative w-full max-w-xl mx-auto aspect-[2/3] rounded-lg shadow-lg overflow-hidden">
              <img :src="`/fondo_${calavera.imagen_fondo_id}.png`" alt="Fondo Calaverita Galeria"
                class="absolute inset-0 w-full h-full object-cover">
              <div class="absolute inset-0"></div>
              <div
                class="absolute inset-0 p-8 sm:p-14 md:p-10 lg:p-16 z-10 overflow-y-auto text-center flex flex-col justify-center mt-48 mb-32 sm:mt-28 sm:mb-0  md:mt-20 md:mb-0">
                <div>
                  <p class="text-gray-100 whitespace-pre-line text-sm sm:text-base">
                    {{ calavera.texto_generado }}
                  </p>
                </div>
              </div>
            </div>
            <button @click="descargarImagenGaleria(calavera)"
              class="mt-4 w-full max-w-xl mx-auto block py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500">
              Descargar esta Calaverita
            </button>
          </div>
        </template>
      </div>
    </div>
    <footer class="mt-auto py-4 text-center text-gray-500 text-sm">
      Generador de Calaveritas Literarias desarrollado por
      <a href="https://tolkogroup.com/" target="_blank" rel="noopener noreferrer" class="underline hover:text-gray-400">
        Tolko Group </a>
    </footer>
  </div>
</template>