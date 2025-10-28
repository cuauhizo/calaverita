// Cargar variables de entorno
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise'); // Usamos la versión con Promesas
const { GoogleGenerativeAI } = require('@google/generative-ai');
// --- Leer dominios desde .env ---
const allowedDomains = (process.env.ALLOWED_DOMAINS || '')
  .split(',')
  .map((domain) => domain.trim().toLowerCase())
  .filter((domain) => domain); // Lee, separa por coma, limpia y filtra vacíos

console.log('Dominios permitidos:', allowedDomains); // Para verificar al iniciar

const app = express();

// 1. Define los orígenes permitidos (la "lista de invitados")
const whitelist = [
  'http://localhost:5173',
  'https://tolkogroup.com',
  'https://www.tolkogroup.com',
  process.env.FRONTEND_URL,
];
const corsOptions = {
  origin: function (origin, callback) {
    // Permitir peticiones sin origen (como las de Postman o de servidor a servidor)
    if (!origin) {
      return callback(null, true);
    }

    // 2. Comprueba si el origen de la petición está en nuestra lista
    if (whitelist.includes(origin)) {
      // Si está permitido, permite la petición
      callback(null, true);
    } else {
      // Si no, recházala
      console.log(`🛑 Bloqueado por CORS: ${origin}`);
      callback(new Error('Error de CORS: Origen no permitido'));
    }
  },
};

app.use(cors(corsOptions));

app.use(express.json()); // Habilita el parseo de JSON

// 1. Configurar Conexión a MySQL
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

// 2. Configurar Cliente de Gemini
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

// --- FUNCIÓN HELPER PARA VALIDAR EMAIL (Simple) ---
function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

// --- FUNCIÓN HELPER PARA EXTRAER DOMINIO ---
function getDomainFromEmail(emailString) {
  if (!emailString || !emailString.includes('@')) {
    return null;
  }
  return emailString.split('@')[1]?.toLowerCase() || null; // Devuelve el dominio en minúsculas
}

// --- NUEVO: Mapeo de Dominios a IDs de Fondos ---
// Asegúrate de que los dominios aquí coincidan EXACTAMENTE (en minúsculas)
// con los definidos en 'allowedDomains' y los identificadores con tus nombres de archivo.
const domainBackgrounds = {
  'proxper.com.mx': ['proxper_1', 'proxper_2', 'proxper_3'],
  'tolkogroup.com': ['tolkogroup_1', 'tolkogroup_2', 'tolkogroup_3'],
  'naturgy.com': ['naturgy_1', 'naturgy_2', 'naturgy_3'],
  // 'amib.com.mx': ['amib_1', 'amib_2', 'amib_3'],
  // 'mmm.com': ['mmm_1', 'mmm_2', 'mmm_3'],
  // 'amsofipo.mx': ['amsofipo_1', 'amsofipo_2', 'amsofipo_3'],
  'biopappel.com': ['biopappel_1', 'biopappel_2', 'biopappel_3'],
  'crediclub.com': ['crediclub_1', 'crediclub_2', 'crediclub_3'],
  'cydsa.com': ['cydsa_1', 'cydsa_2', 'cydsa_3'],
  'nike.com': ['nike_1', 'nike_2', 'nike_3'],
  'pluxeegroup.com': ['pluxeegroup_1', 'pluxeegroup_2', 'pluxeegroup_3'],
  'novonordisk.com': ['novonordisk_1', 'novonordisk_2', 'novonordisk_3'],
};
// console.log('🖼️ Mapeo de fondos por dominio:', domainBackgrounds);

// --- FUNCIÓN HELPER PARA OBTENER FONDO ALEATORIO POR DOMINIO ---
function getRandomBackgroundIdForDomain(domain) {
  const backgrounds = domainBackgrounds[domain];
  if (!backgrounds || backgrounds.length === 0) {
    console.warn(`⚠️ No se encontraron fondos definidos para el dominio: ${domain}. Usando fallback.`);
    // Define tus fondos de fallback aquí
    const fallbackBackgrounds = ['default_1', 'default_2', 'default_3']; // Asegúrate que fondo_default_X.png existan
    const randomIndex = Math.floor(Math.random() * fallbackBackgrounds.length);
    return fallbackBackgrounds[randomIndex]; // Devuelve uno de los defaults aleatoriamente
  }
  // Selecciona un ID aleatorio de la lista específica del dominio
  const randomIndex = Math.floor(Math.random() * backgrounds.length);
  return backgrounds[randomIndex];
}

// 3. Crear el Endpoint
app.post('/api/generar-calavera', async (req, res) => {
  try {
    // ---- NUEVO: Recibir más datos ----
    const { nombre, gustos, profesion, email, tono, puesto, empresa } = req.body;

    // ---- NUEVO: Validación ----
    if (!nombre || nombre.trim() === '') {
      return res.status(400).json({ error: 'El nombre es obligatorio.' });
    }
    if (!email || !isValidEmail(email)) {
      return res.status(400).json({ error: 'Por favor, ingresa un correo electrónico válido.' });
    }
    if (!tono) {
      return res.status(400).json({ error: 'Debes seleccionar un tono para la calaverita.' });
    }

    // --- NUEVO: Validación de Dominio Permitido ---
    const userDomain = getDomainFromEmail(email); // Extrae el dominio
    if (!userDomain || !allowedDomains.includes(userDomain)) {
      console.log(`Intento bloqueado: Dominio ${userDomain} no permitido.`); // Log en servidor
      // 403 Forbidden: El usuario no tiene permiso
      return res.status(403).json({
        error:
          'Lo sentimos, el correo que ingresaste no pertenece a la empresa, intenta de nuevo con un correo válido.',
      });
    }
    // --- FIN Validación de Dominio ---

    // ---- NUEVO: Lógica de Límite por Email (usando tabla 'usuarios') ----
    let connection; // Para manejar la transacción
    try {
      connection = await pool.getConnection();
      await connection.beginTransaction();

      // Verificar si el usuario existe y obtener su contador
      const [usuarios] = await connection.execute(
        'SELECT generaciones_count FROM usuarios WHERE email = ? FOR UPDATE',
        [email]
      );
      let count = 0;
      let usuarioNuevo = true;

      if (usuarios.length > 0) {
        count = usuarios[0].generaciones_count;
        usuarioNuevo = false;
      }

      // Aplicar el límite
      if (count >= 2) {
        await connection.rollback(); // Deshacer transacción
        connection.release();
        return res.status(429).json({ error: 'Has alcanzado el límite permitido de 2 calaveritas.' });
      }

      // ---- NUEVO: Construir el prompt mejorado ----
      let detalles = '';
      if (profesion) detalles += `que tenía la profesión de ${profesion}`;
      if (puesto && empresa) detalles += ` (específicamente ${puesto} en ${empresa})`;
      else if (puesto) detalles += ` (específicamente ${puesto})`;
      if (gustos) detalles += ` y le encantaba ${gustos}`;

      const prompt = `
          Eres un poeta mexicano experto en calaveras literarias del Día de Muertos.
          Escribe una calavera de 3 estrofas y 4 versos cada una (cuarteto) para una persona llamada "${nombre}".

          Aquí tienes algunos detalles de ${nombre}: ${detalles}.

          El tono debe ser **${tono}**.

          Asegúrate de que los versos rimen y menciona de forma graciosa cómo la "Calaca", "Huesuda" o la "Parca" se lo lleva, acorde al tono solicitado. omite cualquier saludo inicial o despedida; solo entrega la calavera directamente.
        `;

      // Llamar a Gemini (sin cambios)
      const result = await model.generateContent(prompt);
      const textoCalavera = result.response.text();

      // ---- Seleccionar ID de fondo aleatorio ----
      // ---- MODIFICADO: Seleccionar ID de fondo BASADO EN DOMINIO ----
      const imagenFondoId = getRandomBackgroundIdForDomain(userDomain);
      if (!imagenFondoId) {
        // Manejar el caso donde no se pudo asignar un fondo (si no usaste fallback)
        console.error(`Error crítico: No se pudo determinar un fondo para el dominio ${userDomain}`);
        // Podrías asignar uno por defecto aquí o lanzar un error
        // Por ahora, asumimos que getRandomBackgroundIdForDomain devuelve algo.
      }
      // ---- FIN MODIFICACIÓN ----

      // Guardar en MySQL (tabla 'calaveras')
      const [dbResult] = await connection.execute(
        'INSERT INTO calaveras (nombre, gustos, profesion, texto_generado, email, tono, puesto, empresa, imagen_fondo_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [nombre, gustos, profesion, textoCalavera, email, tono, puesto, empresa, imagenFondoId]
      );

      // ---- Actualizar o insertar contador en tabla 'usuarios' ----
      if (usuarioNuevo) {
        await connection.execute('INSERT INTO usuarios (email, generaciones_count) VALUES (?, 1)', [email]);
      } else {
        await connection.execute('UPDATE usuarios SET generaciones_count = generaciones_count + 1 WHERE email = ?', [
          email,
        ]);
      }

      // Confirmar transacción
      await connection.commit();
      connection.release();

      // Responder al frontend
      res.status(201).json({
        id: dbResult.insertId,
        calavera: textoCalavera,
        imagenFondoId: imagenFondoId,
      });
    } catch (dbError) {
      // Si algo falla con la BD, deshacer y liberar conexión
      if (connection) {
        await connection.rollback();
        connection.release();
      }
      throw dbError; // Re-lanzar para que lo capture el catch principal
    }
  } catch (error) {
    console.error('Error en /api/generar-calavera:', error);
    // Evitar enviar detalles internos al frontend
    res.status(500).json({ error: 'Ocurrió un error interno al generar la calaverita.' });
  }
});

// 4. Endpoint para obtener las calaveras guardadas
app.get('/api/calaveras', async (req, res) => {
  try {
    // ---- Obtener el email del query parameter ----
    const userEmail = req.query.email;

    // ---- Validación ----
    if (!userEmail || !isValidEmail(userEmail)) {
      // Reutilizamos la función helper
      return res.status(400).json({ error: 'Se requiere un email válido para ver la galería personal.' });
    }

    // Obtenemos las 10 más recientes
    const query = `SELECT id, nombre, texto_generado, fecha_creacion, imagen_fondo_id 
                   FROM calaveras 
                   WHERE email = ? 
                   ORDER BY fecha_creacion DESC`;

    const [rows] = await pool.execute(query, [userEmail]);

    res.status(200).json(rows);
  } catch (error) {
    console.error('Error en GET /api/calaveras:', error);
    res.status(500).json({ error: 'Error al obtener las calaveras personales.' });
  }
});

app.get('/', (req, res) => {
  res.send('API calaveritas funcionando!');
});

// Iniciar servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor backend corriendo en http://localhost:${PORT}`);
});
