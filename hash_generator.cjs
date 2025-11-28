// Usamos 'require' en lugar de 'import' y la extensión .cjs para forzar el uso de CommonJS.
const bcrypt = require('bcrypt');

/**
 * Genera el hash seguro de la contraseña de prueba '12345'.
 * El hash resultante debe ser copiado y pegado en pgAdmin 4.
 */
const hashPassword = async () => {
    // ESTA es la contraseña que usará el usuario final en el formulario de login.
    const password = '12345'; 
    
    // Nivel de complejidad del cifrado
    const saltRounds = 10; 
    
    console.log("Generando hash para la contraseña:", password);

    try {
        // Generar el hash asíncronamente
        const hash = await bcrypt.hash(password, saltRounds);
        
        console.log("-----------------------------------------");
        console.log("⚠️ COPIA ESTE HASH COMPLETO ⚠️");
        console.log("HASH GENERADO:", hash); // ¡Esta es la clave!
        console.log("-----------------------------------------");
    } catch (error) {
        console.error("❌ Error al generar el hash. Asegúrate de que el módulo 'bcrypt' está instalado (npm install bcrypt).", error);
    }
};

hashPassword();