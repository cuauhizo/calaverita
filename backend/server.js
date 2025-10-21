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
const model = genAI.getGenerativeModel({ model: 'gemini-pro' });

// 3. Crear el Endpoint
app.post('/api/generar-calavera', async (req, res) => {
  try {
    // Recibir datos del frontend (Vue)
    const { nombre, gustos, profesion } = req.body;

    // Construir el prompt
    const prompt = `Crea una calavera literaria para ${nombre}, que es ${profesion} y le encanta ${gustos}. Sé breve y humorístico.`;

    // Llamar a Gemini
    const result = await model.generateContent(prompt);
    const textoCalavera = result.response.text();

    // Guardar en MySQL
    const [dbResult] = await pool.execute(
      'INSERT INTO calaveras (nombre, gustos, profesion, texto_generado) VALUES (?, ?, ?, ?)',
      [nombre, gustos, profesion, textoCalavera]
    );

    // Responder al frontend
    res.status(201).json({
      id: dbResult.insertId,
      calavera: textoCalavera,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al generar la calavera' });
  }
});

// Iniciar servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor backend corriendo en http://localhost:${PORT}`);
});
