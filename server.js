// Importa los módulos necesarios
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import pkg from 'pg';
import bcrypt from 'bcrypt'; // Para el manejo seguro de contraseñas

const { Client } = pkg;

// Configuración para usar __dirname en ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();

// --- CORRECCIÓN CRÍTICA DEL PUERTO ---
// Usa process.env.PORT (para Render) o 3000 (para desarrollo local)
const PORT = process.env.PORT || 3000; 
// --------------------------------------

// --- CONFIGURACIÓN DE LA BASE DE DATOS (RENDER) ---
// La URL DEBE estar configurada como una variable de entorno en Render
const DB_URL = process.env.DATABASE_URL || "postgres://peli20_admin:hkwBh51g0UmpEuwNBt2M6ezVDwLmmZCL@dpg-d4jr8aje5dus73epv70g-a.oregon-postgres.render.com/peli20_db";

const client = new Client({
    connectionString: DB_URL,
    // La configuración SSL es necesaria para Render
    ssl: {
        rejectUnauthorized: false
    }
});
// ---------------------------------------------------

// Middleware: Permite a Express leer los datos enviados desde un formulario HTML
app.use(express.urlencoded({ extended: true }));

// 1. Ruta GET para mostrar el formulario de login
app.get('/', (req, res) => {
    // Asegúrate de que 'login.html' exista en el mismo directorio
    res.sendFile(path.join(__dirname, 'login.html')); 
});

// 2. Ruta POST para procesar el envío del formulario de login
app.post('/login', async (req, res) => {
    const username = req.body.username; 
    const password = req.body.password; 

    console.log(`Intento de login con Correo: ${username}`);
    
    // Consulta SQL: Busca el usuario por correo electrónico (columna: 'correo')
    const queryText = 'SELECT contrasena FROM usuarios WHERE correo = $1';

    try {
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

// --- MEJORA DE ROBUSTEZ: Conexión y luego inicio del servidor ---
// Conecta a la base de datos y luego inicia el servidor
client.connect()
    .then(() => {
        console.log('✅ Conexión exitosa a PostgreSQL.');
        
        // Inicia el servidor solo después de la conexión a la BD
        app.listen(PORT, () => {
            console.log(`Servidor de login corriendo en http://localhost:${PORT}`);
        });

    })
    .catch(err => {
        console.error('❌ Error al conectar a PostgreSQL. La aplicación no iniciará:', err.stack);
        // Si no se puede conectar a la BD, la aplicación no debería arrancar
        process.exit(1); 
    });