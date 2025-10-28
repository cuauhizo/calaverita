// 1. DEPENDENCIAS Y CONFIGURACIÓN INICIAL ====================================
require('dotenv').config(); // Carga variables de entorno desde el archivo .env
const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise'); // Cliente MySQL con soporte para Promesas (async/await)
const { GoogleGenerativeAI } = require('@google/generative-ai'); // SDK de Google AI

// 2. CONFIGURACIÓN ===========================================================

// --- Dominios Permitidos (Whitelist) ---
// Lee la variable ALLOWED_DOMAINS del .env, la divide por comas,
// limpia espacios y convierte a minúsculas cada dominio.
const allowedDomains = (process.env.ALLOWED_DOMAINS || '')
  .split(',')
  .map((domain) => domain.trim().toLowerCase())
  .filter((domain) => domain); // Elimina entradas vacías si las hubiera

console.log('✅ Dominios permitidos cargados:', allowedDomains);

// --- Inicialización de Express ---
const app = express();

// --- Configuración de CORS (Cross-Origin Resource Sharing) ---
// Define qué URLs de frontend tienen permiso para acceder a esta API.
const whitelist = [
  'http://localhost:5173', // Servidor de desarrollo de Vite
  'https://tolkogroup.com', // Dominios adicionales permitidos
  'https://www.tolkogroup.com',
  process.env.FRONTEND_URL, // URL del frontend en producción desde .env
];
const corsOptions = {
  origin: function (origin, callback) {
    // Permite peticiones sin 'origin' (ej. Postman, scripts del servidor)
    // o si el 'origin' está en nuestra lista blanca.
    if (!origin || whitelist.includes(origin)) {
      callback(null, true); // Permite la petición
    } else {
      console.error(`🛑 Bloqueado por CORS: Origen ${origin} no está en la whitelist.`);
      callback(new Error('Error de CORS: Origen no permitido')); // Rechaza la petición
    }
  },
};
app.use(cors(corsOptions)); // Aplica la configuración de CORS
app.use(express.json()); // Middleware para parsear bodies de request JSON

// --- Pool de Conexiones a MySQL ---
// Configura y crea un pool para manejar conexiones a la BD de forma eficiente.
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true, // Espera si todas las conexiones están ocupadas
  connectionLimit: 10, // Número máximo de conexiones simultáneas
  queueLimit: 0, // Sin límite para peticiones en espera
});
console.log('✅ Pool de MySQL conectado.');

// --- Cliente de Google Gemini AI ---
// Inicializa el cliente de la API de Gemini con la clave del .env.
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
// Selecciona el modelo específico de Gemini a utilizar (ej. flash para rapidez)
const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' }); // Asegúrate que este modelo te funcione
console.log(`✅ Cliente de Gemini inicializado con modelo: ${model.model}`);

// --- Mapeo de Dominios a Fondos ---
// Asocia cada dominio permitido con una lista de identificadores de sus fondos.
const domainBackgrounds = {
  'proxper.com.mx': ['proxper_1', 'proxper_2', 'proxper_3'],
  'tolkogroup.com': ['tolkogroup_1', 'tolkogroup_2', 'tolkogroup_3'],
  'naturgy.com': ['naturgy_1', 'naturgy_2', 'naturgy_3'],
  'biopappel.com': ['biopappel_1', 'biopappel_2', 'biopappel_3'],
  'crediclub.com': ['crediclub_1', 'crediclub_2', 'crediclub_3'],
  'cydsa.com': ['cydsa_1', 'cydsa_2', 'cydsa_3'],
  'nike.com': ['nike_1', 'nike_2', 'nike_3'],
  'pluxeegroup.com': ['pluxeegroup_1', 'pluxeegroup_2', 'pluxeegroup_3'],
  'novonordisk.com': ['novonordisk_1', 'novonordisk_2', 'novonordisk_3'],
  // Agrega aquí mapeos para OTROS dominios si es necesario
};
// console.log('🖼️ Mapeo de fondos por dominio:', domainBackgrounds); // Descomenta si necesitas depurar

// --- Mapeo de Dominios a Nombres Coloquiales (para el Prompt) ---
// Define nombres más amigables o cortos para usar en el texto generado.
const domainColloquialNames = {
  'tolkogroup.com': 'Tolko',
  'biopappel.com': 'Bio Pappel',
  // 'mmm.com': '3M', // Ejemplo comentado
  'novonordisk.com': 'Novo Nordisk',
  'cydsa.com': 'Cydsa',
  'pluxeegroup.com': 'Pluxee',
  // Agrega otros si es necesario
};
console.log('🗣️ Nombres coloquiales definidos:', domainColloquialNames);

// 3. FUNCIONES HELPER ========================================================

/**
 * Valida el formato básico de un email.
 * @param {string} email Email a validar.
 * @returns {boolean} True si el formato es válido.
 */
function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Extrae la parte del dominio de un email, en minúsculas.
 * @param {string} emailString Email completo.
 * @returns {string|null} Dominio en minúsculas o null si es inválido.
 */
function getDomainFromEmail(emailString) {
  if (!emailString || !emailString.includes('@')) {
    return null;
  }
  return emailString.split('@')[1]?.toLowerCase() || null;
}

/**
 * Selecciona aleatoriamente un identificador de fondo basado en el dominio del email.
 * Usa un fondo "default" si el dominio no está mapeado o no tiene fondos definidos.
 * @param {string} domain Dominio del email (en minúsculas).
 * @returns {string} Identificador del fondo (ej. 'empresa1_2', 'default_1').
 */
function getRandomBackgroundIdForDomain(domain) {
  const backgrounds = domainBackgrounds[domain];
  if (!backgrounds || backgrounds.length === 0) {
    console.warn(`⚠️ Fondos no definidos para ${domain}. Usando fallback.`);
    const fallbackBackgrounds = ['default_1', 'default_2', 'default_3']; // Asegúrate que fondo_default_X.png existan en /frontend/public
    const randomIndex = Math.floor(Math.random() * fallbackBackgrounds.length);
    return fallbackBackgrounds[randomIndex];
  }
  const randomIndex = Math.floor(Math.random() * backgrounds.length);
  return backgrounds[randomIndex];
}

// 4. ENDPOINTS DE LA API =====================================================

/**
 * POST /api/generar-calavera
 * Endpoint principal:
 * 1. Valida los datos de entrada y el dominio del email.
 * 2. Verifica si el usuario ha alcanzado el límite de generación (2).
 * 3. Construye el prompt para Gemini con detalles y tono.
 * 4. Llama a la API de Gemini para generar el texto.
 * 5. Selecciona un fondo apropiado basado en el dominio.
 * 6. Guarda la calaverita y actualiza el contador del usuario en la BD (transacción).
 * 7. Devuelve la calaverita generada y el ID del fondo al frontend.
 */
app.post('/api/generar-calavera', async (req, res) => {
  let connection = null; // Para asegurar liberación en 'finally'
  try {
    // --- Recibir y Validar Datos ---
    const { nombre, gustos, profesion, email, tono, puesto } = req.body;
    const userDomain = getDomainFromEmail(email); // Dominio completo, ej: 'empresa1.com'

    if (!nombre || nombre.trim() === '') return res.status(400).json({ error: 'El nombre es obligatorio.' });
    if (!email || !isValidEmail(email))
      return res.status(400).json({ error: 'Por favor, ingresa un correo electrónico válido.' });
    if (!tono) return res.status(400).json({ error: 'Debes seleccionar un tono para la calaverita.' });

    // --- Validación de Dominio Permitido ---
    if (!userDomain || !allowedDomains.includes(userDomain)) {
      console.warn(`🚫 Dominio no permitido: ${userDomain} para email ${email}`);
      return res.status(403).json({
        error:
          'Lo sentimos, el correo que ingresaste no pertenece a la empresa, intenta de nuevo con un correo válido.',
      });
    }

    // --- Preparar Nombre de Empresa para Prompt ---
    let empresaNombreLimpio = userDomain
      .replace(/\.com\.mx$/i, '')
      .replace(/\.com$/i, '')
      .replace(/\.mx$/i, '');
    // Usar nombre coloquial si está definido, si no, el nombre limpio.
    const nombreEmpresaParaPrompt = domainColloquialNames[userDomain] || empresaNombreLimpio;

    // --- Lógica de Límite de Generación (Transacción) ---
    connection = await pool.getConnection();
    await connection.beginTransaction();

    const [usuarios] = await connection.execute('SELECT generaciones_count FROM usuarios WHERE email = ? FOR UPDATE', [
      email,
    ]);
    let count = usuarios.length > 0 ? usuarios[0].generaciones_count : 0;
    const usuarioNuevo = usuarios.length === 0;

    if (count >= 2) {
      await connection.rollback();
      console.warn(`⚖️ Límite alcanzado para: ${email}`);
      return res.status(429).json({ error: 'Has alcanzado el límite permitido de 2 calaveritas.' });
    }

    // --- Construir Prompt para Gemini ---
    let detalles = '';
    if (profesion) detalles += `que tenía la profesión de ${profesion}`;
    if (puesto && nombreEmpresaParaPrompt) detalles += ` (específicamente ${puesto} en ${nombreEmpresaParaPrompt})`;
    else if (puesto) detalles += ` (específicamente ${puesto})`;
    if (gustos) detalles += ` y le encantaba ${gustos}`;

    const prompt = `
          Eres un poeta mexicano experto en calaveras literarias del Día de Muertos.
          Escribe una calavera de 3 estrofas y 4 versos cada una (cuarteto) para una persona llamada "${nombre}".
          Aquí tienes algunos detalles de ${nombre}: ${detalles}.
          El tono debe ser **${tono}**.
          Asegúrate de que los versos rimen y menciona de forma graciosa cómo la "Calaca", "Huesuda" o la "Parca" se lo lleva, acorde al tono solicitado. omite cualquier saludo inicial o despedida; solo entrega la calavera directamente.`;

    // --- Llamar a Gemini ---
    console.log(`🤖 Llamando a Gemini para: ${nombre} (${email})`);
    const result = await model.generateContent(prompt);
    const textoCalavera = result.response.text();
    console.log(`✨ Calaverita generada para: ${nombre}`);

    // --- Seleccionar Fondo y Guardar en BD ---
    const imagenFondoId = getRandomBackgroundIdForDomain(userDomain); // String 'dominio_X' o 'default_X'

    // ¡VERIFICA que la columna 'imagen_fondo_id' en MySQL sea VARCHAR!
    const [dbResult] = await connection.execute(
      'INSERT INTO calaveras (nombre, gustos, profesion, texto_generado, email, tono, puesto, empresa, imagen_fondo_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [nombre, gustos, profesion, textoCalavera, email, tono, puesto, userDomain, imagenFondoId] // Guardamos userDomain completo
    );

    // --- Actualizar Contador de Usuario ---
    if (usuarioNuevo) {
      await connection.execute('INSERT INTO usuarios (email, generaciones_count) VALUES (?, 1)', [email]);
    } else {
      await connection.execute('UPDATE usuarios SET generaciones_count = generaciones_count + 1 WHERE email = ?', [
        email,
      ]);
    }

    // --- Finalizar Transacción y Enviar Respuesta ---
    await connection.commit(); // Confirma los cambios en la BD
    console.log(`💾 Calaverita guardada (ID: ${dbResult.insertId}), Fondo: ${imagenFondoId}, para: ${email}`);

    res.status(201).json({
      id: dbResult.insertId,
      calavera: textoCalavera,
      imagenFondoId: imagenFondoId,
    });
  } catch (error) {
    // --- Manejo de Errores ---
    console.error('❌ Error en POST /api/generar-calavera:', error);
    if (connection) {
      // Intenta deshacer la transacción si hubo un error
      try {
        await connection.rollback();
      } catch (rbError) {
        console.error('Error al hacer rollback:', rbError);
      }
    }
    res.status(500).json({ error: 'Ocurrió un error interno al generar la calaverita.' });
  } finally {
    // --- Liberar Conexión ---
    if (connection) {
      connection.release(); // Siempre devuelve la conexión al pool
    }
  }
});

/**
 * GET /api/calaveras
 * Obtiene las calaveritas generadas previamente por un email específico.
 * Requiere el parámetro 'email' en la query string.
 */
app.get('/api/calaveras', async (req, res) => {
  try {
    // --- Validar Email de la Query ---
    const userEmail = req.query.email;
    if (!userEmail || !isValidEmail(userEmail)) {
      return res.status(400).json({ error: 'Se requiere un email válido para ver la galería personal.' });
    }

    // --- Consultar BD ---
    console.log(`🔍 Buscando calaveritas para: ${userEmail}`);
    const query = `
      SELECT id, nombre, texto_generado, fecha_creacion, imagen_fondo_id 
      FROM calaveras 
      WHERE email = ? 
      ORDER BY fecha_creacion DESC`; // Ordena para mostrar la más reciente primero
    const [rows] = await pool.execute(query, [userEmail]);
    console.log(`📄 Encontradas ${rows.length} calaveritas para: ${userEmail}`);

    // --- Enviar Respuesta ---
    res.status(200).json(rows);
  } catch (error) {
    // --- Manejo de Errores ---
    console.error('❌ Error en GET /api/calaveras:', error);
    res.status(500).json({ error: 'Error al obtener las calaveras personales.' });
  }
});

/**
 * GET /
 * Endpoint raíz simple para verificar que la API está en línea.
 */
app.get('/', (req, res) => {
  res.send('API de Calaveritas funcionando! 🎉');
});

// 5. INICIAR EL SERVIDOR ======================================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Servidor backend corriendo en http://localhost:${PORT}`);
});
