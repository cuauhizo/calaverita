// Cargar variables de entorno
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise'); // Usamos la versión con Promesas
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
app.use(cors()); // Habilita CORS para que Vue (desde otro puerto) pueda conectarse
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
// const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
// const model = genAI.getGenerativeModel({ model: 'gemini-pro' });
const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

// --- FUNCIÓN HELPER PARA VALIDAR EMAIL (Simple) ---
function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
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
        return res.status(429).json({ error: 'Has alcanzado el límite de 2 calaveritas por correo.' });
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

          Asegúrate de que los versos rimen y menciona de forma graciosa cómo la "Calaca", "Huesuda" o la "Parca" se lo lleva, acorde al tono solicitado.
        `;

      // Llamar a Gemini (sin cambios)
      const result = await model.generateContent(prompt);
      const textoCalavera = result.response.text();

      // Guardar en MySQL (tabla 'calaveras')
      const [dbResult] = await connection.execute(
        'INSERT INTO calaveras (nombre, gustos, profesion, texto_generado, tono, puesto, empresa) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [nombre, gustos, profesion, textoCalavera, tono, puesto, empresa]
      );

      // ---- NUEVO: Actualizar o insertar contador en tabla 'usuarios' ----
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
    // Obtenemos las 10 más recientes
    const [rows] = await pool.execute(
      'SELECT nombre, texto_generado, fecha_creacion FROM calaveras ORDER BY fecha_creacion DESC LIMIT 10'
    );
    res.status(200).json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al obtener las calaveras' });
  }
});

// Iniciar servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor backend corriendo en http://localhost:${PORT}`);
});
