const express = require('express');
const sqlite3 = require('sqlite3').verbose(); // Manejo de base de datos SQLite
const axios = require('axios'); // Para solicitudes HTTP (Ubidots)
const path = require('path');
const cors = require('cors');

const app = express();
const db = new sqlite3.Database('./database.sqlite'); // Base de datos SQLite

// Configuración de Ubidots
const UBIDOTS_TOKEN = "BBUS-hj17WuRYMbwTWeHtNkWPfABOfYNGbS"; // Reemplazar con tu token real
const UBIDOTS_BASE_URL = "https://industrial.api.ubidots.com/api/v1.6/variables";
const TEMPERATURE_VAR_ID = "6726a235a32aed34c2227c63"; // ID de "temperature"
const DISTANCE_VAR_ID = "6726a24b77443131b79bf278"; // ID de "distance"

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Inicialización de la base de datos
db.serialize(() => {
  // Crear tabla de usuarios si no existe
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT,
      apellido TEXT,
      correo TEXT UNIQUE,
      usuario TEXT UNIQUE,
      contraseña TEXT,
      rol TEXT DEFAULT 'user'
    )
  `);

  // Crear tabla de peceras si no existe
  db.run(`
    CREATE TABLE IF NOT EXISTS peceras (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT,
      usuario_id INTEGER,
      FOREIGN KEY(usuario_id) REFERENCES users(id)
    )
  `);

  // Crear usuario admin si no existe
  db.get("SELECT * FROM users WHERE usuario = 'admin'", (err, row) => {
    if (!row) {
      db.run(`
        INSERT INTO users (nombre, apellido, correo, usuario, contraseña, rol)
        VALUES ('Admin', 'System', 'admin@pecerapp.com', 'admin', 'admin123', 'admin')
      `, (err) => {
        if (err) console.error('Error al crear usuario admin:', err);
        else console.log('Usuario admin creado con éxito.');
      });
    }
  });
});

// Ruta principal para servir home.html
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'home.html'));
});

// Ruta para obtener datos de Ubidots
app.get('/peceras/data', async (req, res) => {
  try {
    const [temperatureResponse, distanceResponse] = await Promise.all([
      axios.get(`${UBIDOTS_BASE_URL}/${TEMPERATURE_VAR_ID}`, {
        headers: { 'X-Auth-Token': UBIDOTS_TOKEN },
      }),
      axios.get(`${UBIDOTS_BASE_URL}/${DISTANCE_VAR_ID}`, {
        headers: { 'X-Auth-Token': UBIDOTS_TOKEN },
      }),
    ]);

    const temperature = temperatureResponse.data.last_value.value;
    const distance = distanceResponse.data.last_value.value;

    console.log(`[PECERAS DATA] -> Temperature: ${temperature}°C, Distance: ${distance}cm`);

    res.json({
      variables: [
        { label: "temperature", id: TEMPERATURE_VAR_ID, value: temperature },
        { label: "distance", id: DISTANCE_VAR_ID, value: distance }
      ]
    });
  } catch (error) {
    console.error('Error al obtener datos de Ubidots:', error.response?.data || error.message);
    res.status(500).json({ error: 'No se pudieron obtener los datos de Ubidots' });
  }
});

// Ruta para login
app.post('/login', (req, res) => {
  const { usuario, contraseña } = req.body;

  db.get(
    `SELECT * FROM users WHERE usuario = ? AND contraseña = ?`,
    [usuario, contraseña],
    (err, user) => {
      if (err) {
        console.error('Error al buscar usuario:', err);
        return res.status(500).json({ error: 'Error en el servidor' });
      }

      if (!user) {
        return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
      }

      res.json({
        userId: user.id,
        nombre: user.nombre,
        rol: user.rol,
      });
    }
  );
});

// Ruta para registro
app.post('/register', (req, res) => {
  const { nombre, apellido, correo, usuario, contraseña } = req.body;

  db.run(
    `INSERT INTO users (nombre, apellido, correo, usuario, contraseña, rol) VALUES (?, ?, ?, ?, ?, 'user')`,
    [nombre, apellido, correo, usuario, contraseña],
    function (err) {
      if (err) {
        console.error('Error al registrar usuario:', err);
        return res.status(400).json({ error: 'Usuario o correo ya existe.' });
      }

      res.json({
        message: 'Registro exitoso',
        userId: this.lastID,
      });
    }
  );
});

// Ruta para obtener usuarios (solo admin)
app.get('/admin/users', (req, res) => {
  db.all(`SELECT id, nombre, apellido, correo, usuario, rol FROM users`, [], (err, rows) => {
    if (err) {
      console.error('Error al obtener usuarios:', err);
      return res.status(500).json({ error: 'Error al obtener usuarios' });
    }

    res.json(rows);
  });
});

// Ruta para eliminar usuario (solo admin)
app.delete('/admin/users/:id', (req, res) => {
  const userId = req.params.id;

  db.run(`DELETE FROM users WHERE id = ?`, [userId], function (err) {
    if (err) {
      console.error('Error al eliminar usuario:', err);
      return res.status(500).json({ error: 'No se pudo eliminar el usuario' });
    }

    res.json({ message: 'Usuario eliminado con éxito' });
  });
});

// Puerto
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
