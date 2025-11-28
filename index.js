// Importa los módulos necesarios
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import pkg from 'pg';
import bcrypt from 'bcrypt';
import session from 'express-session'; 
import methodOverride from 'method-override'; // 👈 AÑADIDO: Para soportar DELETE en formularios

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
app.use(session({
    secret: process.env.SESSION_SECRET || 'mi-secreto-super-seguro', 
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 3600000 } // Sesión válida por 1 hora
}));
// ----------------------------

// Middleware para simular DELETE y PUT en formularios HTML (importante para el botón Eliminar)
app.use(methodOverride('_method'));

// Middleware: Permite a Express leer los datos enviados desde un formulario HTML
app.use(express.urlencoded({ extended: true }));

// --- Middleware de Autenticación (Protege rutas) ---
function isAuthenticated(req, res, next) {
    if (req.session.userId) {
        return next(); // Usuario autenticado
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
    if (req.session.userId) {
        return res.redirect('/productos');
    }
    res.sendFile(path.join(__dirname, 'login.html')); 
});

// 2. Ruta POST para procesar el envío del formulario de login
app.post('/login', async (req, res) => {
    const username = req.body.username; 
    const password = req.body.password; 

    const queryText = 'SELECT id, contrasena FROM usuarios WHERE correo = $1';

    try {
        const result = await client.query(queryText, [username]);

        if (result.rows.length === 0) {
            return res.send('<h1>Error de credenciales.</h1><p>Usuario o contraseña incorrectos.</p>');
        }

        const storedHash = result.rows[0].contrasena;
        const match = await bcrypt.compare(password, storedHash);

        if (match) {
            req.session.userId = result.rows[0].id; 
            req.session.username = username;
            
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
    res.redirect('/productos/listar');
});

// 4. Ruta GET para mostrar el formulario de Ingresar Producto
app.get('/productos/ingresar', isAuthenticated, (req, res) => {
    res.sendFile(path.join(__dirname, 'productos_ingresar.html'));
});

// 5. Ruta POST para guardar el nuevo producto
app.post('/productos/ingresar', isAuthenticated, async (req, res) => {
    const { nombre, descripcion, precio, stock } = req.body;
    
    const queryText = 'INSERT INTO productos (nombre, descripcion, precio, stock, creado_por_id) VALUES ($1, $2, $3, $4, $5) RETURNING id';
    
    try {
        const result = await client.query(queryText, [nombre, descripcion, parseFloat(precio), parseInt(stock), req.session.userId]);
        console.log(`Producto ID ${result.rows[0].id} ingresado.`);
        res.redirect('/productos/listar');
        
    } catch (err) {
        console.error('❌ Error al insertar producto:', err.stack);
        res.status(500).send('<h1>Error interno al ingresar el producto.</h1>');
    }
});


// 6. Ruta GET para mostrar el listado de productos (Listar)
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


// 7. Ruta GET para el formulario de EDICIÓN (pre-llenado)
// Esta es la ruta que te faltaba y causaba el error 'Cannot GET'
app.get('/productos/editar/:id', isAuthenticated, async (req, res) => {
    const productId = req.params.id;
    try {
        const result = await client.query('SELECT * FROM productos WHERE id = $1', [productId]);
        
        if (result.rows.length === 0) {
            return res.status(404).send('<h1>Producto no encontrado.</h1>');
        }

        const producto = result.rows[0];
        // Genera el HTML del formulario de edición con los datos del producto
        res.send(generateEditFormHtml(producto));

    } catch (err) {
        console.error('❌ Error al obtener producto para edición:', err.stack);
        res.status(500).send('<h1>Error interno al cargar el producto.</h1>');
    }
});


// 8. Ruta POST para actualizar el producto (el UPDATE)
app.post('/productos/editar/:id', isAuthenticated, async (req, res) => {
    const productId = req.params.id;
    const { nombre, descripcion, precio, stock } = req.body;

    const queryText = 'UPDATE productos SET nombre = $1, descripcion = $2, precio = $3, stock = $4 WHERE id = $5';
    
    try {
        await client.query(queryText, [nombre, descripcion, parseFloat(precio), parseInt(stock), productId]);
        console.log(`Producto ID ${productId} actualizado.`);
        res.redirect('/productos/listar');

    } catch (err) {
        console.error('❌ Error al actualizar producto:', err.stack);
        res.status(500).send('<h1>Error interno al actualizar el producto.</h1>');
    }
});


// 9. Ruta DELETE para eliminar el producto
// Se activa con el formulario en generateProductListHtml gracias a methodOverride
app.delete('/productos/eliminar/:id', isAuthenticated, async (req, res) => {
    const productId = req.params.id;

    try {
        await client.query('DELETE FROM productos WHERE id = $1', [productId]);
        console.log(`Producto ID ${productId} eliminado.`);
        // Redirige de nuevo a la lista después de eliminar
        res.redirect('/productos/listar');
    } catch (err) {
        console.error('❌ Error al eliminar producto:', err.stack);
        res.status(500).send('<h1>Error interno al eliminar el producto.</h1>');
    }
});


// ----------------------------------------------------------------------------------
// --- FUNCIÓN PARA GENERAR EL HTML DE LISTADO (ACTUALIZADA) ---
// Se ha mejorado el estilo y se añadió el formulario DELETE correcto
// ----------------------------------------------------------------------------------
function generateProductListHtml(productos, username) {
    let listItems = productos.map(p => `
        <tr class="border-t hover:bg-gray-50 transition duration-150">
            <td class="px-4 py-2">${p.id}</td>
            <td class="px-4 py-2 font-semibold">${p.nombre}</td>
            <td class="px-4 py-2 text-green-700">$${parseFloat(p.precio).toFixed(2)}</td>
            <td class="px-4 py-2 ${p.stock <= 5 ? 'text-red-500 font-bold' : 'text-gray-700'}">${p.stock}</td>
            <td class="px-4 py-2 flex space-x-2">
                <a href="/productos/editar/${p.id}" class="bg-blue-500 hover:bg-blue-600 text-white font-medium py-1 px-3 rounded-lg text-sm shadow-md transition duration-150">Editar</a>
                
                <!-- Formulario DELETE usando method-override -->
                <form method="POST" action="/productos/eliminar/${p.id}?_method=DELETE">
                    <button type="submit" class="bg-red-500 hover:bg-red-600 text-white font-medium py-1 px-3 rounded-lg text-sm shadow-md transition duration-150" onclick="return confirm('⚠️ ¿Estás seguro de que quieres eliminar el producto ${p.nombre}? Esta acción es irreversible.');">Eliminar</button>
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
            <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800&display=swap" rel="stylesheet">
            <style> body { font-family: 'Inter', sans-serif; } </style>
        </head>
        <body class="bg-gray-100 min-h-screen p-8">
            <div class="max-w-5xl mx-auto bg-white p-8 rounded-xl shadow-2xl">
                <header class="mb-6 border-b pb-4 flex justify-between items-center">
                    <h1 class="text-3xl font-extrabold text-blue-700">🛒 Gestión de Inventario</h1>
                    <div class="flex items-center space-x-4">
                        <span class="text-gray-700">Bienvenido, <span class="font-bold text-blue-700">${username}</span></span>
                        <a href="/logout" class="bg-red-500 hover:bg-red-600 text-white font-medium py-2 px-4 rounded-lg transition duration-150 shadow-md">Cerrar Sesión</a>
                    </div>
                </header>

                <nav class="mb-6 flex space-x-4">
                    <a href="/productos/ingresar" class="bg-green-600 hover:bg-green-700 text-white font-medium py-2 px-4 rounded-lg transition duration-150 shadow-lg">➕ Ingresar Nuevo Producto</a>
                    <a href="/productos/listar" class="bg-gray-700 hover:bg-gray-800 text-white font-medium py-2 px-4 rounded-lg transition duration-150 shadow-lg">📋 Listar Productos</a>
                </nav>

                <h2 class="text-2xl font-bold text-gray-800 mb-4">Listado de Productos (${productos.length})</h2>
                
                <div class="overflow-x-auto border rounded-lg shadow-inner">
                    <table class="min-w-full bg-white">
                        <thead class="bg-blue-500 text-white">
                            <tr>
                                <th class="px-4 py-3 text-left text-sm font-semibold">ID</th>
                                <th class="px-4 py-3 text-left text-sm font-semibold">Nombre</th>
                                <th class="px-4 py-3 text-left text-sm font-semibold">Precio</th>
                                <th class="px-4 py-3 text-left text-sm font-semibold">Stock</th>
                                <th class="px-4 py-3 text-left text-sm font-semibold">Acciones</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${listItems.length > 0 ? listItems : `<tr><td colspan="5" class="text-center py-12 text-gray-500 italic">No hay productos registrados. Usa el botón "Ingresar Nuevo Producto" para empezar.</td></tr>`}
                        </tbody>
                    </table>
                </div>
            </div>
        </body>
        </html>
    `;
}

// ----------------------------------------------------------------------------------
// --- FUNCIÓN PARA GENERAR EL HTML DEL FORMULARIO DE EDICIÓN ---
// Esta función es necesaria para la ruta app.get('/productos/editar/:id')
// ----------------------------------------------------------------------------------
function generateEditFormHtml(producto) {
    return `
        <!DOCTYPE html>
        <html lang="es">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Editar Producto #${producto.id}</title>
            <script src="https://cdn.tailwindcss.com"></script>
            <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
            <style> body { font-family: 'Inter', sans-serif; } </style>
        </head>
        <body class="bg-gray-50 min-h-screen flex items-center justify-center p-4">
            <div class="w-full max-w-lg bg-white rounded-xl shadow-2xl p-8 border border-gray-200">
                <h1 class="text-3xl font-extrabold text-blue-600 mb-6 text-center border-b pb-3">
                    ✍️ Editar Producto #${producto.id}
                </h1>

                <!-- El action llama a la ruta POST /productos/editar/:id -->
                <form action="/productos/editar/${producto.id}" method="POST" class="space-y-6">
                    
                    <div>
                        <label for="nombre" class="block text-sm font-medium text-gray-700 mb-1">Nombre del Producto</label>
                        <input type="text" id="nombre" name="nombre" required 
                               value="${producto.nombre}"
                               class="mt-1 block w-full px-4 py-2 border border-gray-300 rounded-lg shadow-sm focus:ring-blue-500 focus:border-blue-500 transition duration-150">
                    </div>

                    <div>
                        <label for="descripcion" class="block text-sm font-medium text-gray-700 mb-1">Descripción</label>
                        <textarea id="descripcion" name="descripcion" rows="3" required 
                                  class="mt-1 block w-full px-4 py-2 border border-gray-300 rounded-lg shadow-sm focus:ring-blue-500 focus:border-blue-500 transition duration-150">${producto.descripcion || ''}</textarea>
                    </div>

                    <div class="grid grid-cols-2 gap-6">
                        <div>
                            <label for="precio" class="block text-sm font-medium text-gray-700 mb-1">Precio ($)</label>
                            <input type="number" id="precio" name="precio" step="0.01" required 
                                   value="${parseFloat(producto.precio).toFixed(2)}"
                                   class="mt-1 block w-full px-4 py-2 border border-gray-300 rounded-lg shadow-sm focus:ring-blue-500 focus:border-blue-500 transition duration-150">
                        </div>
                        <div>
                            <label for="stock" class="block text-sm font-medium text-gray-700 mb-1">Stock (Cantidad)</label>
                            <input type="number" id="stock" name="stock" required 
                                   value="${producto.stock}"
                                   class="mt-1 block w-full px-4 py-2 border border-gray-300 rounded-lg shadow-sm focus:ring-blue-500 focus:border-blue-500 transition duration-150">
                        </div>
                    </div>

                    <div class="flex justify-between items-center pt-4">
                        <a href="/productos/listar" class="text-sm font-medium text-gray-600 hover:text-blue-600 transition duration-150">← Cancelar y Volver</a>
                        <button type="submit" 
                                class="px-6 py-3 bg-green-600 text-white font-semibold rounded-lg shadow-lg hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 transition duration-150">
                            Guardar Cambios
                        </button>
                    </div>
                </form>
            </div>
        </body>
        </html>
    `;
}


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