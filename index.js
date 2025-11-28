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

// --- CONFIGURACIÓN DEL PUERTO ---
// Usa process.env.PORT (para Render) o 3000 (para desarrollo local)
const PORT = process.env.PORT || 3000; 
// --------------------------------

// --- CONFIGURACIÓN DE LA BASE DE DATOS (RENDER) ---
// La URL DEBE estar configurada como una variable de entorno en Render (DATABASE_URL)
const DB_URL = process.env.DATABASE_URL;

if (!DB_URL) {
    console.error("❌ ERROR CRÍTICO: La variable DATABASE_URL no está definida en el entorno de Render.");
    // Forzamos el cierre de la aplicación para que no intente conectarse
    process.exit(1);
}

// ⚠️ Definición de la variable 'client'. 
// Todo código que use 'client' debe ir DESPUÉS de estas líneas.
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

// ----------------------------------------------------------------------------------
// --- INICIO DE CONEXIÓN Y SERVIDOR (DEBE IR AL FINAL) ---
// ----------------------------------------------------------------------------------

// Conecta a la base de datos y luego inicia el servidor
client.connect()
    .then(() => {
        console.log('✅ Conexión exitosa a PostgreSQL. Servidor iniciando.');
        
        // Inicia el servidor solo después de la conexión a la BD
        app.listen(PORT, () => {
            console.log(`Servidor de login corriendo en puerto ${PORT}`);
        });

    })
    .catch(err => {
        // 🚨 BLOQUE DE LOGGING EXTENDIDO 🚨
        console.log('--- INICIO DEL ERROR DE CONEXIÓN CRÍTICO ---');
        console.log('❌ Error: La aplicación no pudo conectar a PostgreSQL.');
        console.log('Detalles del error:', err.message); 
        console.log('Stack completo:', err.stack); 
        console.log('--- FIN DEL ERROR DE CONEXIÓN CRÍTICO ---');
        
        // Hacemos un breve retraso para que los logs se envíen
        setTimeout(() => {
            process.exit(1); 
        }, 1000); 
    });