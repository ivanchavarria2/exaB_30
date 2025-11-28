// Importa los módulos necesarios
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import pkg from 'pg';
import bcrypt from 'bcrypt';
import session from 'express-session'; // 👈 NUEVO: Manejo de sesiones

const { Client } = pkg;

// Configuración para usar __dirname en ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();

// --- CONFIGURACIÓN DEL PUERTO ---
const PORT = process.env.PORT || 3000; 
// --------------------------------

// --- CONFIGURACIÓN DE LA BASE DE DATOS (RENDER) ---
const DB_URL = process.env.DATABASE_URL;

if (!DB_URL) {
    console.error("❌ ERROR CRÍTICO: La variable DATABASE_URL no está definida.");
    process.exit(1);
}

const client = new Client({
    connectionString: DB_URL,
    ssl: {
        rejectUnauthorized: false
    }
});
// ---------------------------------------------------

// --- MIDDLEWARE DE SESIÓN ---
// Configuramos express-session. NECESITAS una clave secreta.
// Configura esta variable de entorno en Render también: SESSION_SECRET
app.use(session({
    secret: process.env.SESSION_SECRET || 'mi-secreto-super-seguro', 
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 3600000 } // Sesión válida por 1 hora
}));
// ----------------------------

// Middleware: Permite a Express leer los datos enviados desde un formulario HTML
app.use(express.urlencoded({ extended: true }));

// --- Middleware de Autenticación (Protege rutas) ---
function isAuthenticated(req, res, next) {
    if (req.session.userId) {
        return next(); // Usuario autenticado, pasa a la siguiente función de ruta
    }
    // Si no está autenticado, redirige al login
    res.redirect('/');
}
// -----------------------------------------------------


// =================================================================
// ------------------------ RUTAS PÚBLICAS -------------------------
// =================================================================

// 1. Ruta GET para mostrar el formulario de login
app.get('/', (req, res) => {
    // Si el usuario ya está logueado, redirige a productos
    if (req.session.userId) {
        return res.redirect('/productos');
    }
    res.sendFile(path.join(__dirname, 'login.html')); 
});

// 2. Ruta POST para procesar el envío del formulario de login
app.post('/login', async (req, res) => {
    const username = req.body.username; 
    const password = req.body.password; 

    // Consulta SQL: Busca el usuario por correo electrónico
    const queryText = 'SELECT id, contrasena FROM usuarios WHERE correo = $1';

    try {
        const result = await client.query(queryText, [username]);

        if (result.rows.length === 0) {
            return res.send('<h1>Error de credenciales.</h1><p>Usuario o contraseña incorrectos.</p>');
        }

        const storedHash = result.rows[0].contrasena;

        const match = await bcrypt.compare(password, storedHash);

        if (match) {
            // *** ÉXITO: Crear la sesión ***
            req.session.userId = result.rows[0].id; 
            req.session.username = username;
            
            // 👈 CAMBIO CRÍTICO: Redirigir a la vista de productos
            res.redirect('/productos'); 
        } else {
            res.send('<h1>Error de credenciales.</h1><p>Usuario o contraseña incorrectos.</p>');
        }

    } catch (err) {
        console.error('❌ Error al ejecutar la consulta de login:', err.stack);
        res.status(500).send('<h1>Error interno del servidor.</h1><p>Por favor, inténtalo de nuevo más tarde.</p>');
    }
});

// Ruta para cerrar sesión
app.get('/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) {
            console.error('Error al cerrar sesión:', err);
        }
        res.redirect('/');
    });
});


// =================================================================
// ----------------------- RUTAS PROTEGIDAS (CRUD) --------------------
// =================================================================

// 3. Ruta GET para la página principal de Productos
app.get('/productos', isAuthenticated, (req, res) => {
    // Redirige a la vista de listar productos
    res.redirect('/productos/listar');
});

// 4. Ruta GET para mostrar el formulario de Ingresar Producto
app.get('/productos/ingresar', isAuthenticated, (req, res) => {
    res.sendFile(path.join(__dirname, 'productos_ingresar.html'));
});

// 5. Ruta POST para guardar el nuevo producto
app.post('/productos/ingresar', isAuthenticated, async (req, res) => {
    const { nombre, descripcion, precio, stock } = req.body;
    
    // Consulta para insertar producto
    const queryText = 'INSERT INTO productos (nombre, descripcion, precio, stock, creado_por_id) VALUES ($1, $2, $3, $4, $5) RETURNING id';
    
    try {
        const result = await client.query(queryText, [nombre, descripcion, parseFloat(precio), parseInt(stock), req.session.userId]);
        console.log(`Producto ID ${result.rows[0].id} ingresado por el usuario ${req.session.userId}`);
        res.send(`<h1>Producto '${nombre}' ingresado con éxito!</h1><p><a href="/productos/listar">Ver listado</a></p>`);
        
    } catch (err) {
        console.error('❌ Error al insertar producto:', err.stack);
        res.status(500).send('<h1>Error interno al ingresar el producto.</h1>');
    }
});

// 6. Ruta GET para mostrar el listado de productos
app.get('/productos/listar', isAuthenticated, async (req, res) => {
    try {
        const result = await client.query('SELECT * FROM productos ORDER BY id DESC');
        const productos = result.rows;
        
        // Renderizar el HTML con los datos
        res.send(generateProductListHtml(productos, req.session.username));

    } catch (err) {
        console.error('❌ Error al listar productos:', err.stack);
        res.status(500).send('<h1>Error interno al obtener el listado de productos.</h1>');
    }
});


// ----------------------------------------------------------------------------------
// --- FUNCIÓN PARA GENERAR EL HTML DE LISTADO (TEMPORAL) ---
// En una aplicación real usarías un motor de plantillas como EJS o Handlebars
function generateProductListHtml(productos, username) {
    let listItems = productos.map(p => `
        <tr class="border-t">
            <td class="px-4 py-2">${p.id}</td>
            <td class="px-4 py-2 font-semibold">${p.nombre}</td>
            <td class="px-4 py-2">${p.precio}</td>
            <td class="px-4 py-2">${p.stock}</td>
            <td class="px-4 py-2 flex space-x-2">
                <a href="/productos/editar/${p.id}" class="bg-blue-500 hover:bg-blue-700 text-white font-bold py-1 px-3 rounded text-sm">Editar</a>
                <form method="POST" action="/productos/eliminar/${p.id}">
                    <input type="hidden" name="_method" value="DELETE">
                    <button type="submit" class="bg-red-500 hover:bg-red-700 text-white font-bold py-1 px-3 rounded text-sm" onclick="return confirm('¿Seguro que quieres eliminar ${p.nombre}?');">Eliminar</button>
                </form>
            </td>
        </tr>
    `).join('');

    return `
        <!DOCTYPE html>
        <html lang="es">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Listado de Productos - CRUD</title>
            <script src="https://cdn.tailwindcss.com"></script>
        </head>
        <body class="bg-gray-100 min-h-screen p-8">
            <div class="max-w-4xl mx-auto bg-white p-6 rounded-xl shadow-2xl">
                <header class="mb-6 border-b pb-4 flex justify-between items-center">
                    <h1 class="text-3xl font-extrabold text-blue-600">Gestión de Productos</h1>
                    <div class="flex items-center space-x-4">
                        <span class="text-gray-700">Bienvenido, <span class="font-bold text-blue-700">${username}</span></span>
                        <a href="/logout" class="bg-red-500 hover:bg-red-600 text-white font-medium py-2 px-4 rounded-lg transition duration-150">Cerrar Sesión</a>
                    </div>
                </header>

                <nav class="mb-6 flex space-x-4">
                    <a href="/productos/ingresar" class="bg-green-500 hover:bg-green-600 text-white font-medium py-2 px-4 rounded-lg transition duration-150 shadow-md">➕ Ingresar Nuevo Producto</a>
                    <a href="/productos/listar" class="bg-gray-700 hover:bg-gray-800 text-white font-medium py-2 px-4 rounded-lg transition duration-150 shadow-md">📋 Listar Productos</a>
                </nav>

                <h2 class="text-2xl font-semibold text-gray-800 mb-4">Listado de Productos (${productos.length})</h2>
                
                <div class="overflow-x-auto">
                    <table class="min-w-full bg-white rounded-lg overflow-hidden">
                        <thead class="bg-gray-200">
                            <tr>
                                <th class="px-4 py-3 text-left text-sm font-medium text-gray-600">ID</th>
                                <th class="px-4 py-3 text-left text-sm font-medium text-gray-600">Nombre</th>
                                <th class="px-4 py-3 text-left text-sm font-medium text-gray-600">Precio</th>
                                <th class="px-4 py-3 text-left text-sm font-medium text-gray-600">Stock</th>
                                <th class="px-4 py-3 text-left text-sm font-medium text-gray-600">Acciones</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${listItems.length > 0 ? listItems : `<tr><td colspan="5" class="text-center py-8 text-gray-500">No hay productos registrados. Ingresa uno nuevo.</td></tr>`}
                        </tbody>
                    </table>
                </div>
            </div>
        </body>
        </html>
    `;
}

// 7. [FALTA IMPLEMENTAR] Rutas de Editar y Eliminar (DELETE)
// Aquí irían las rutas para editar y eliminar, que puedes implementar después.


// ----------------------------------------------------------------------------------
// --- INICIO DE CONEXIÓN Y SERVIDOR (DEBE IR AL FINAL) ---
// ----------------------------------------------------------------------------------

// Conecta a la base de datos y luego inicia el servidor
client.connect()
    .then(() => {
        console.log('✅ Conexión exitosa a PostgreSQL. Servidor iniciando.');
        
        app.listen(PORT, () => {
            console.log(`Servidor de login corriendo en puerto ${PORT}`);
        });

    })
    .catch(err => {
        console.log('--- INICIO DEL ERROR DE CONEXIÓN CRÍTICO ---');
        console.log('❌ Error: La aplicación no pudo conectar a PostgreSQL.');
        console.log('Detalles del error:', err.message); 
        console.log('Stack completo:', err.stack); 
        console.log('--- FIN DEL ERROR DE CONEXIÓN CRÍTICO ---');
        
        setTimeout(() => {
            process.exit(1); 
        }, 1000); 
    });