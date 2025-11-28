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
        // 🚨 CAMBIO TÁCTICO: Usamos console.log() antes de console.error() y process.exit()
        // para asegurarnos de que el mensaje se imprima en Render.
        console.log('--- INICIO DEL ERROR DE CONEXIÓN CRÍTICO ---');
        console.log('❌ Error: La aplicación no pudo conectar a PostgreSQL.');
        console.log('Detalles del error:', err.message); // Imprimir solo el mensaje
        console.log('Stack completo:', err.stack); // Imprimir la pila completa
        console.log('--- FIN DEL ERROR DE CONEXIÓN CRÍTICO ---');
        
        // Hacemos un breve retraso para que los logs se envíen
        setTimeout(() => {
            process.exit(1); 
        }, 1000); 
    });