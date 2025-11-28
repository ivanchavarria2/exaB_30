// Importa los módulos necesarios
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import pkg from 'pg';
import bcrypt from 'bcrypt'; // Importamos bcrypt para el manejo seguro de contraseñas

const { Client } = pkg;

// Configuración para usar __dirname en ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const port = 3000;

// --- CONFIGURACIÓN DE LA BASE DE DATOS (RENDER) ---
// ⚠️ CORRECCIÓN CLAVE: Se usó la URL de conexión estándar 'postgres://...'
// Esta URL se construyó a partir de los datos de conexión que proporcionaste.
const DB_URL = process.env.DATABASE_URL || "postgres://peli20_admin:hkwBh51g0UmpEuwNBt2M6ezVDwLmmZCL@dpg-d4jr8aje5dus73epv70g-a.oregon-postgres.render.com/peli20_db";

const client = new Client({
    connectionString: DB_URL,
    // La configuración SSL es necesaria cuando se conecta a la BD de Render
    ssl: {
        rejectUnauthorized: false
    }
});

// Conecta a la base de datos una vez al inicio
client.connect()
    .then(() => console.log('✅ Conexión exitosa a PostgreSQL.'))
    .catch(err => console.error('❌ Error al conectar a PostgreSQL:', err.stack));
// ---------------------------------------------------


// Middleware: Permite a Express leer los datos enviados desde un formulario HTML
app.use(express.urlencoded({ extended: true }));

// 1. Ruta GET para mostrar el formulario de login
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'login.html'));
});

// 2. Ruta POST para procesar el envío del formulario de login
// Hacemos la función ASÍNCRONA para poder usar 'await'
app.post('/login', async (req, res) => {
    const username = req.body.username; // Usaremos esto para el campo 'correo'
    const password = req.body.password; // La contraseña ingresada por el usuario

    console.log(`Intento de login con Correo: ${username}`);
    
    // Consulta SQL: Busca el usuario por correo electrónico (columna: 'correo')
    const queryText = 'SELECT contrasena FROM usuarios WHERE correo = $1';

    try {
        // Asegúrate de que el cliente esté conectado antes de hacer la consulta.
        // Si la conexión falla al inicio, este código podría ejecutarse antes de que 
        // se maneje el error, causando el segundo error 'Connection terminated unexpectedly'.
        
        const result = await client.query(queryText, [username]);

        if (result.rows.length === 0) {
            // Usuario no encontrado
            return res.send('<h1>Error de credenciales.</h1><p>Usuario o contraseña incorrectos.</p>');
        }

        const storedHash = result.rows[0].contrasena;

        // *** PASO DE SEGURIDAD CRÍTICO: Comparación con bcrypt ***
        const match = await bcrypt.compare(password, storedHash);

        if (match) {
            res.send(`<h1>🎉 ¡Inicio de sesión exitoso! Bienvenido ${username}.</h1>`);
        } else {
            // La contraseña no coincide con el hash almacenado
            res.send('<h1>Error de credenciales.</h1><p>Usuario o contraseña incorrectos.</p>');
        }

    } catch (err) {
        console.error('❌ Error al ejecutar la consulta de login:', err.stack);
        res.status(500).send('<h1>Error interno del servidor.</h1><p>Por favor, inténtalo de nuevo más tarde.</p>');
    }
});

// Inicia el servidor
app.listen(port, () => {
    console.log(`Servidor de login corriendo en http://localhost:${port}`);
});