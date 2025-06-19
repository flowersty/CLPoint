// backend/server.js

require('dotenv').config(); // Carga variables de ./backend/.env
const express = require('express');
const { MercadoPagoConfig, Preference, Payment } = require('mercadopago');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const port = process.env.PORT || 3000;

// --- Configuración de Supabase (Backend con Service Role Key) ---
const supabaseUrl = process.env.SUPABASE_URL;
// ¡Importante! Usar la CLAVE SECRETA DEL ROL DE SERVICIO para tener permisos para UPDATE en 'medicamentos'
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !supabaseKey) {
    console.error("\n⛔ ERROR CRÍTICO: Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en backend/.env!\n");
    process.exit(1); // Detener el servidor si faltan credenciales
}
const supabase = createClient(supabaseUrl, supabaseKey);
console.log("✅ Cliente Supabase inicializado para backend.");

// --- Configuración de Mercado Pago ---
const mpAccessToken = process.env.MP_ACCESS_TOKEN;
if (!mpAccessToken) {
    console.error("\n⛔ ERROR CRÍTICO: MP_ACCESS_TOKEN no encontrado en backend/.env!\n");
    process.exit(1); // Detener si falta el token
}
const isTestMode = mpAccessToken.startsWith('TEST-'); // Detectar si es token de prueba
const client = new MercadoPagoConfig({ accessToken: mpAccessToken, options: { timeout: 5000 } });
const preference = new Preference(client);
const paymentClient = new Payment(client);
const MP_CURRENCY_ID = process.env.MP_CURRENCY_ID || "MXN"; // Moneda por defecto

// --- Middleware ---
app.use(cors()); // Habilitar CORS para permitir peticiones desde tu frontend
// Middleware específico para la ruta del webhook de MP (necesita el cuerpo raw, sin parsear)
app.use('/mercado_pago_webhook', express.raw({ type: 'application/json' }));
// Middleware para parsear JSON en todas las demás rutas
app.use(express.json());

// Middleware simple para loggear cada petición recibida
app.use((req, res, next) => {
    const logPrefix = `[${req.method} ${req.path} - ${Date.now().toString().slice(-6)}]`; // Identificador para logs
    console.log(`\n➡️  ${logPrefix} Solicitud recibida.`);
    // Intenta parsear/stringificar solo si no es el webhook y si hay un body que parece JSON
    if (req.body && req.path !== '/mercado_pago_webhook') {
         try {
             // Check if body is an object and not empty
             if (typeof req.body === 'object' && Object.keys(req.body).length > 0) {
                console.log(`   ${logPrefix} Body:`, JSON.stringify(req.body, null, 2));
             } else if (Buffer.isBuffer(req.body)) {
                console.log(`   ${logPrefix} Body: (Buffer - ${req.body.length} bytes)`);
             }
         } catch (e) {
             console.warn(`   ${logPrefix} No se pudo loggear body como JSON o es vacío:`, e.message);
         }
    } else if (req.path === '/mercado_pago_webhook' && Buffer.isBuffer(req.body) && req.body.length > 0) {
        // Log webhook body as raw text if it's a buffer
         console.log(`   ${logPrefix} Webhook Body (raw): ${req.body.toString('utf8').substring(0, 200)}...`); // Log first 200 chars
    } else if (req.body && Object.keys(req.body).length === 0) {
         console.log(`   ${logPrefix} Body: {} (Empty)`);
    }
    req.logPrefix = logPrefix; // Añadir prefijo al objeto req para usarlo en las rutas
    next();
});


// --- Función Auxiliar para Descontar Stock (Usa RPC con id_farmacia) ---
// Mantenemos esta función para el *descuento* del stock.
// La actualización de fecha_ultimo_movimiento se hace por separado ahora.
/*
-- Asegúrate de haber ejecutado esto en tu Editor SQL de Supabase:
-- (Tu definición actual de la función descontar_stock)
CREATE OR REPLACE FUNCTION descontar_stock(
    item_upc text,
    cantidad_a_descontar int,
    farmacia_id_param int -- O bigint, uuid, text según tu columna id_farmacia en 'medicamentos'
)
RETURNS void
LANGUAGE plpgsql
AS $$
-- ... contenido de la función ...
$$;
*/
// Asegúrate que esta función esté definida y accessible via RPC en tu proyecto Supabase.
// En tu backend, la llamas así:
async function deductStockByRpc(items, logPrefixParent) {
     // Implementación actual de deductStockForOrder usando supabase.rpc('descontar_stock')
     // ... (copia aquí la función deductStockForOrder tal cual la tenías antes de esta actualización) ...
     const functionName = `[Stock Deduct RPC]`;
     const logPrefix = `${logPrefixParent} ${functionName}`;
     console.log(`${logPrefix} Iniciando deducción stock via RPC para ${items?.length || 0} tipos de items.`);
     let allSucceeded = true;
     const errors = [];
     const deductionMap = new Map();

     if (items && Array.isArray(items)) {
        for (const item of items) {
             // Validar item antes de agregarlo al mapa
             if (!item.upc || item.id_farmacia === undefined || item.id_farmacia === null || !item.cantidad || item.cantidad <= 0) {
                 console.warn(`${logPrefix} Item inválido omitido de deducción stock:`, JSON.stringify(item));
                 errors.push(`Item stock inválido (UPC: ${item.upc || 'N/A'}, Cant: ${item.cantidad || 'N/A'}, Farm: ${item.id_farmacia === undefined ? 'N/A' : item.id_farmacia})`);
                 allSucceeded = false;
                 continue;
             }
             const key = `${item.upc}|${item.id_farmacia}`;
             const currentAmount = deductionMap.get(key) || 0;
             deductionMap.set(key, currentAmount + item.cantidad);
         }
     }

    if (deductionMap.size === 0 && items && items.length > 0) {
        console.warn(`${logPrefix} No hay items válidos para descontar stock (todos filtrados).`);
        return { success: false, errors: errors.length > 0 ? errors : ["No items válidos para procesar stock."] };
    }
    if (deductionMap.size === 0 && (!items || items.length === 0)) {
       console.log(`${logPrefix} Carrito vacío, no se descuenta stock.`);
       return { success: true, errors: [] };
    }


     for (const [key, totalQuantity] of deductionMap.entries()) {
         const [upc, farmacia_id_str] = key.split('|');
         const farmacia_id = parseInt(farmacia_id_str, 10); // Convertir a número

         try {
             console.log(`   ${logPrefix} Llamando RPC: descontar_stock(upc=${upc}, cantidad=${totalQuantity}, farmacia=${farmacia_id})`);
             const { error: rpcError } = await supabase.rpc('descontar_stock', {
                  item_upc: upc,
                  cantidad_a_descontar: totalQuantity,
                  farmacia_id_param: farmacia_id
             });

             if (rpcError) {
                  console.error(`   ${logPrefix} ERROR RPC (UPC ${upc}, Farm ${farmacia_id}):`, rpcError.message);
                  throw new Error(`Stock insuficiente/Error DB para UPC ${upc} (Farmacia ${farmacia_id}): ${rpcError.message}`);
             }
             console.log(`   ${logPrefix} Éxito RPC (UPC ${upc}, Farm ${farmacia_id}).`);

         } catch (error) {
             console.error(`   ${logPrefix} FALLO (UPC ${upc}, Farm ${farmacia_id}):`, error.message || error);
             allSucceeded = false;
             errors.push(error.message || `Error desconocido al descontar stock para UPC ${upc} / Farmacia ${farmacia_id}.`);
         }
     }

     console.log(`${logPrefix} Deducción stock RPC finalizada: success=${allSucceeded}, errors count=${errors.length}`);
     return { success: allSucceeded, errors: errors };
}


// --- Función Auxiliar para Actualizar Fecha de Último Movimiento ---
// Recibe la lista de items (del carrito o webhook) y la marca de tiempo
async function updateLastMovement(items, timestamp, logPrefixParent) {
    const functionName = `[Update Last Movement]`;
    const logPrefix = `${logPrefixParent} ${functionName}`;
    console.log(`${logPrefix} Iniciando actualización de último movimiento para ${items?.length || 0} items.`);
    const updatedMedicineIds = new Set(); // Para no actualizar el mismo medicamento varias veces

    if (!items || !Array.isArray(items) || items.length === 0) {
        console.log(`${logPrefix} No hay items en la lista. Omitiendo actualización de movimiento.`);
        return { successCount: 0, errors: [] }; // No hay nada que hacer
    }

    const errors = [];
    let successCount = 0;

    for (const item of items) {
         // Asumimos que el ID del medicamento en el array de items es 'id_farmaco'.
         // Ajusta 'item.id_farmaco' si tu JSON de carrito o webhook usa otra key (ej. 'id', 'medicineId')
         const medicineId = item.id_farmaco;

         // Validar ID y evitar duplicados
         if ((typeof medicineId !== 'number' && typeof medicineId !== 'string') || updatedMedicineIds.has(medicineId)) {
             console.warn(`   ${logPrefix} Saltando item inválido o duplicado para actualización de movimiento: ${JSON.stringify(item)}`);
             continue; // Saltar este item
         }

        try {
            // Ejecutar el UPDATE en la tabla 'medicamentos'
            console.log(`   ${logPrefix} Actualizando fecha_ultimo_movimiento para medicamento ID ${medicineId} a ${timestamp}...`);
            const { error: updateError, count } = await supabase
                .from('medicamentos')
                .update({ fecha_ultimo_movimiento: timestamp })
                .eq('id_farmaco', medicineId); // WHERE id_farmaco = ID del medicamento
            
            // 'count' indica cuántas filas fueron afectadas. Debería ser 1 si el ID existe.
            if (updateError) {
                console.error(`   ${logPrefix} ERROR Supabase al actualizar fecha_ultimo_movimiento para med ID ${medicineId}:`, updateError.message);
                errors.push(`Error update movimiento para med ID ${medicineId}: ${updateError.message}`);
            } else if (count === 0) {
                 console.warn(`   ${logPrefix} Actualización de fecha_ultimo_movimiento no afectó filas para med ID ${medicineId} (quizás no encontrado).`);
                 errors.push(`Medicamento ID ${medicineId} no encontrado para actualizar fecha de movimiento.`);
            } else {
                console.log(`   ${logPrefix} Éxito al actualizar fecha_ultimo_movimiento para medicamento ID ${medicineId}.`);
                updatedMedicineIds.add(medicineId); // Marcar como procesado y exitoso
                successCount++;
            }

        } catch (updateException) {
             console.error(`   ${logPrefix} EXCEPCIÓN al actualizar fecha_ultimo_movimiento para medicamento ID ${medicineId}:`, updateException);
             errors.push(`Excepción update movimiento para med ID ${medicineId}: ${updateException.message || 'Desconocido'}`);
        }
    }

    console.log(`${logPrefix} Actualización de último movimiento finalizada. Éxitos: ${successCount}, Fallos: ${errors.length}`);
    return { successCount, errors };
}


// --- Rutas Principales ---

/**
 * POST /create_order
 * Recibe los detalles de la venta desde el frontend.
 */
app.post('/create_order', async (req, res) => {
    const start = Date.now();
    const logPrefix = req.logPrefix;
    let orderId = null; // Definir orderId al inicio

    // --- AÑADIR TRY...CATCH EXTERNO PARA CAPTURAR CUALQUIER ERROR NO CAPTURADO ANTES ---
    try {
        // Extraer todos los campos esperados del frontend
        const {
            amount, description, paciente_id, compra_sin_cuenta, cartItems, id_farmacia,
            payment_method, prescription_update_data,
            cash_session_id, id_trabajador, referencia_tarjeta
        } = req.body;

        console.log(`${logPrefix} Recibido: Method=${payment_method}, Farmacia=${id_farmacia}, Amount=${amount}, Items=${cartItems?.length}, CashSession=${cash_session_id}, Worker=${id_trabajador}, CardRef=${referencia_tarjeta}`);

        // --- Validaciones de Entrada ---
        // Estas validaciones son SÍNCRONAS y previenen llamadas innecesarias a la DB/MP
        if (!amount || typeof amount !== 'number' || amount <= 0) {
            console.warn(`${logPrefix} Rechazado (400): Monto inválido.`);
            return res.status(400).json({ message: 'Monto inválido.' });
        }
        // Validar método de pago
        if (!payment_method || !['efectivo', 'mercadoPagoQR', 'tarjeta'].includes(payment_method)) {
            console.warn(`${logPrefix} Rechazado (400): Método de pago '${payment_method}' inválido o faltante.`);
             return res.status(400).json({ message: 'Método de pago inválido o faltante.' });
        }
         // Validar ID de farmacia
         if (id_farmacia === undefined || id_farmacia === null || (typeof id_farmacia !== 'number' && typeof id_farmacia !== 'string')) {
            console.warn(`${logPrefix} Rechazado (400): Falta o ID de farmacia inválido.`);
             return res.status(400).json({ message: 'Falta ID de farmacia.' });
         }
         // Validar carrito (debe ser array y no vacío)
         if (!cartItems || !Array.isArray(cartItems) || cartItems.length === 0) {
            console.warn(`${logPrefix} Rechazado (400): Carrito vacío o inválido.`);
            return res.status(400).json({ message: 'El carrito está vacío o es inválido.' });
         }
         // Validar consistencia de id_farmacia en items (opcional pero bueno)
         // Asegúrate que item.id_farmacia exista en cada item y coincida con el id_farmacia de la venta
         if (!cartItems.every(item => item.id_farmacia !== undefined && item.id_farmacia !== null && item.id_farmacia == id_farmacia)) {
              console.warn(`${logPrefix} Rechazado (400): Inconsistencia o falta de ID de farmacia en los items del carrito.`);
              return res.status(400).json({ message: 'Error interno: Inconsistencia o faltan datos de farmacia en los items del carrito.' });
          }

        // NUEVAS VALIDACIONES PARA CAJA Y TRABAJADOR (asumiendo que son obligatorios para ventas)
        if (!cash_session_id) {
            console.warn(`${logPrefix} Rechazado (400): Falta ID de sesión de caja (cash_session_id).`);
            return res.status(400).json({ message: 'Falta ID de sesión de caja. Por favor, abre la caja primero.' });
        }
        if (!id_trabajador) {
            console.warn(`${logPrefix} Rechazado (400): Falta ID de trabajador.`);
            return res.status(400).json({ message: 'Falta ID de trabajador.' });
        }
        // Validar referencia_tarjeta SOLO si el método es tarjeta
        if (payment_method === 'tarjeta' && (!referencia_tarjeta || typeof referencia_tarjeta !== 'string' || referencia_tarjeta.trim() === '')) {
            console.warn(`${logPrefix} Rechazado (400): Falta referencia de tarjeta para pago con tarjeta.`);
            return res.status(400).json({ message: 'Falta referencia de tarjeta para pago con tarjeta.' });
        }


        const finalDescription = description || `Compra POS ${new Date().toISOString().slice(-10)}`; // Descripción más corta
        const saleTimestamp = new Date().toISOString(); // Marca de tiempo ÚNICA para esta venta

        // --- 1. Crear la Orden en Supabase (tabla 'ventas') ---
        console.log(`${logPrefix} 1. Creando registro en tabla 'ventas'...`);
        let initialState;
        if (payment_method === 'mercadoPagoQR') { initialState = 'pendiente'; }
        else if (payment_method === 'efectivo') { initialState = 'procesando_efectivo'; } // Estado intermedio para efectivo
        else if (payment_method === 'tarjeta') { initialState = 'procesando_tarjeta'; } // Estado intermedio para tarjeta
        else { initialState = 'desconocido'; }

        const { data: newOrderData, error: insertError } = await supabase
            .from('ventas')
            .insert({
                monto_total: amount,
                // Limitar longitud de descripción si es muy larga
                descripcion: finalDescription.substring(0, 255),
                estado: initialState,
                metodo_pago_solicitado: payment_method,
                paciente_id: paciente_id || null,
                compra_sin_cuenta: Boolean(compra_sin_cuenta),
                items_json: cartItems, // Guardar los items como JSON (debe contener id_farmaco, etc.)
                id_farmacia: id_farmacia,
                receta_asociada_id: prescription_update_data?.receta_id || null,
                cash_session_id: cash_session_id,
                id_trabajador: id_trabajador,
                referencia_tarjeta: payment_method === 'tarjeta' ? referencia_tarjeta.trim() : null,
                // created_at y last_updated_at se manejan por DB
                // fecha_pago se establece para efectivo/tarjeta aquí, para MP en el webhook
                fecha_pago: (payment_method !== 'mercadoPagoQR' ? saleTimestamp : null)
            })
            .select('id') // Devolver el ID de la nueva orden
            .single();

        if (insertError) { throw insertError; } // Si falla la inserción, lanzar el error

        orderId = newOrderData.id;
        console.log(`   ${logPrefix} Orden ${orderId} creada en DB (Estado: ${initialState}).`);


        // --- 1.5. Actualizar fecha_ultimo_movimiento para items vendidos ---
        // Esto se hace AHORA después de que la venta está en la DB
        // Esto aplica para TODOS los métodos de pago
        const movementUpdateResult = await updateLastMovement(cartItems, saleTimestamp, logPrefix);
        if (movementUpdateResult.errors.length > 0) {
             console.error(`${logPrefix} Fallos al actualizar fecha_ultimo_movimiento para orden ${orderId}:`, movementUpdateResult.errors);
             // Agregar estos errores a las notas internas de la venta
             const { data: currentOrderNotes } = await supabase.from('ventas').select('notas_internas').eq('id', orderId).single();
             const newNotes = (currentOrderNotes?.notas_internas || '') + `; Errores mov: ${movementUpdateResult.errors.join('; ')}`;
             await supabase.from('ventas').update({ notas_internas: newNotes }).eq('id', orderId);
        } else {
             console.log(`${logPrefix} Actualización fecha_ultimo_movimiento completada para orden ${orderId}. Éxitos: ${movementUpdateResult.successCount}`);
        }


        // --- 2. Intentar actualizar la Receta si los datos existen ---
        // ... (Tu lógica actual para actualizar receta) ...
        // Si esta lógica lanza una excepción, será capturada por el catch externo


        // --- 3. Lógica según Método de Pago ---

        // A) Mercado Pago QR (asíncrono)
        if (payment_method === 'mercadoPagoQR') {
            console.log(`${logPrefix} 3. Creando Preferencia MP para orden ${orderId}...`);
            const preferenceData = {
                items: [{ id: `order_${orderId}`, title: finalDescription.substring(0, 250), quantity: 1, currency_id: MP_CURRENCY_ID, unit_price: amount }],
                external_reference: orderId.toString(), // Nuestro orderId
                purpose: 'wallet_purchase',
                notification_url: process.env.MP_WEBHOOK_URL,
            };
            try {
                const result = await preference.create({ body: preferenceData });
                const paymentUrl = isTestMode ? result.sandbox_init_point : result.init_point;
                const mpPreferenceId = result.id;

                if (!paymentUrl || !mpPreferenceId) throw new Error('MP no devolvió URL de pago o ID de preferencia.');
                console.log(`      ${logPrefix} Pref MP ${mpPreferenceId} creada para orden ${orderId}.`);

                // Actualizar la orden con el ID de la preferencia de MP
                 await supabase.from('ventas').update({ mp_preferencia_id: mpPreferenceId }).eq('id', orderId);

                console.log(`${logPrefix} 4. Éxito MP QR. Enviando URL y OrderID ${orderId}. Tiempo: ${Date.now() - start}ms`);
                // Devolver al frontend la URL de pago y el ID de la orden
                return res.json({ init_point_url: paymentUrl, order_id: orderId });

            } catch (mpError) {
                 // Si falla la creación de la preferencia, la venta ya está en DB y el movimiento actualizado.
                 // Marcamos la venta con error MP y relanzamos para que el catch externo la maneje.
                console.error(`   ${logPrefix} ERROR creando Preferencia MP para orden ${orderId}:`, mpError.message, mpError.cause);
                await supabase.from('ventas').update({ estado: 'error_mp', notas_internas: `Error MP Pref: ${mpError.message}` }).eq('id', orderId);
                throw mpError; // Relanzar para que el catch externo lo capture
            }
        }

        // B) Efectivo O Tarjeta (síncrono)
        else if (payment_method === 'efectivo' || payment_method === 'tarjeta') {
            console.log(`${logPrefix} 3. Procesando Venta ${payment_method} para orden ${orderId}. Descontando stock...`);
            // Descontar stock inmediatamente para estos métodos (RPC es la mejor forma)
            const deductionResult = await deductStockByRpc(cartItems, logPrefix);

            // 4. Actualizar estado de la venta en 'ventas'
            if (deductionResult.success) {
                console.log(`   ${logPrefix} Stock descontado. Marcando orden ${orderId} como 'pagada'.`);
                try {
                    const { error: updateStatusError } = await supabase.from('ventas').update({
                        estado: 'pagada', // Estado final
                        metodo_pago_confirmado: payment_method, // Método confirmado
                        // fecha_pago ya se estableció arriba con saleTimestamp
                    }).eq('id', orderId);
                    if (updateStatusError) throw updateStatusError;

                    // Éxito total para efectivo/tarjeta
                    console.log(`   ${logPrefix} Orden ${orderId} completada (${payment_method}). Tiempo: ${Date.now() - start}ms`);
                    return res.status(200).json({
                        message: `Venta por ${payment_method} registrada y stock descontado.`,
                        orderId: orderId,
                        receipt_number: orderId // Devolver ID como recibo
                    });
                } catch (updateError) {
                     // Si falla la última actualización de estado, la venta y stock están bien.
                    console.error(`   ${logPrefix} CRÍTICO: Orden ${orderId} (${payment_method}) completada, stock descontado, PERO FALLO al marcar estado final 'pagada':`, updateError.message);
                     const { data: currentOrderNotes } = await supabase.from('ventas').select('notas_internas').eq('id', orderId).single();
                     const newNotes = (currentOrderNotes?.notas_internas || '') + `; CRÍTICO: Error final update estado: ${updateError.message}`;
                    await supabase.from('ventas').update({ notas_internas: newNotes }).eq('id', orderId);
                     // Devuelve 200, pero el log indica que hubo un problema menor al final.
                     return res.status(200).json({
                         message: `Venta completada con ${payment_method}, pero hubo un error menor al registrar el estado final. Contacte a soporte.`,
                         orderId: orderId,
                         receipt_number: orderId
                     });
                }
            } else {
                // Si hubo errores al descontar stock (RPC falló)
                console.error(`   ${logPrefix} FALLO al descontar stock para orden ${orderId} (${payment_method}):`, deductionResult.errors);
                // La venta ya se creó, la marcamos con error de stock
                 await supabase.from('ventas').update({
                     estado: 'error_stock', // Estado: error de stock
                     metodo_pago_confirmado: null, // No se confirmó el pago
                     fecha_pago: null,
                     notas_internas: `FALLO STOCK: ${deductionResult.errors.join('; ')}` // Añadir errores a las notas
                 }).eq('id', orderId);
                 // Lanzar error para que el catch externo lo maneje y devuelva 409
                 const stockErrorMessage = `No se pudo completar la venta por ${payment_method} debido a errores de stock. Detalles: ${deductionResult.errors.join('; ')}`;
                 throw new Error(stockErrorMessage);
            }
        } else {
             // Este caso debería ser capturado por la validación inicial
             console.warn(`${logPrefix} Método de pago desconocido o faltante: ${payment_method}`);
             throw new Error(`Método de pago desconocido.`);
        }

    } catch (generalError) {
        // --- CATCH EXTERNO: CAPTURA CUALQUIER ERROR NO MANEJADO EXPLICITAMENTE ARRIBA ---
        console.error(`${logPrefix} ERROR NO CAPTURADO en /create_order:`, generalError.message, generalError);

        // Si la orden ya fue creada (tenemos orderId), intentamos actualizarla con el error
        if (orderId) {
            try {
                 // Recuperar notas internas actuales para no sobrescribir
                 const { data: currentOrderNotes } = await supabase.from('ventas').select('notas_internas').eq('id', orderId).single();
                 const newNotes = (currentOrderNotes?.notas_internas || '') + `; Error ruta /create_order: ${generalError.message || 'Desconocido'}`;

                // Decidir el estado de error basado en el error.
                let errorState = 'error_backend'; // Estado genérico de error del backend
                 if (generalError.message.includes('Stock insuficiente') || generalError.message.includes('Error de stock')) {
                     errorState = 'error_stock'; // Marcar específicamente si fue un error de stock
                 } else if (generalError.message.includes('Error MP Pref')) {
                     errorState = 'error_mp'; // Marcar específicamente si fue un error de MP
                 }

                // Intentar actualizar el estado y las notas.
                // No sobrescribimos estado si ya fue marcado como pagado (aunque unlikely en un error)
                await supabase.from('ventas')
                    .update({
                         estado: errorState,
                         notas_internas: newNotes,
                         metodo_pago_confirmado: null, // No se pudo confirmar el pago final
                         fecha_pago: null, // No se pudo registrar fecha de pago final
                    })
                    .eq('id', orderId)
                    .in('estado', ['pendiente', 'procesando_efectivo', 'procesando_tarjeta', 'error_mp', 'error_stock']); // Solo actualizar si está en estados 'procesando' o de error previo

            } catch (updateError) {
                console.error(`${logPrefix} CRÍTICO: FALLO ADICIONAL al registrar error en orden ${orderId}:`, updateError.message);
            }
        }

        // Devolver respuesta JSON de error al frontend
        // Usar un código de estado 409 si es específicamente por stock, 500 para otros.
        const statusCode = (generalError.message.includes('Stock insuficiente') || generalError.message.includes('Error de stock')) ? 409 : 500;

        return res.status(statusCode).json({
            message: `Error procesando la venta: ${generalError.message}`,
            orderId: orderId, // Devolver el orderId si se llegó a crear, puede ser útil para depurar
            // Opcional: Si quieres devolver los errores de stock específicos si statusCode es 409
            ...(statusCode === 409 && generalError.message.includes('Detalles:') && { stockErrors: generalError.message.split('Detalles:')[1]?.split(';') })
        });

    } finally {
        console.log(`${logPrefix} Ruta /create_order finalizada. Tiempo total: ${Date.now() - start}ms`);
    }
});


/**
 * POST /mercado_pago_webhook
 * Recibe notificaciones de Mercado Pago sobre el estado de los pagos.
 */
app.post('/mercado_pago_webhook', async (req, res) => {
    const logPrefix = `[MP Webhook ${Date.now().toString().slice(-6)}]`;
    console.log(`${logPrefix} ------ Webhook MP Recibido ------`);
    // TODO: Implementar validación de X-Signature para seguridad seria

    let notification;
    try {
        // Asegúrate de que req.body sea un Buffer o similar y parseable
        notification = JSON.parse(req.body.toString('utf8')); // Especificar encoding utf8
        console.log(`${logPrefix} Body parseado: Type=${notification?.type}, DataID=${notification?.data?.id}, LiveMode=${notification?.live_mode}`);
    } catch (e) {
        console.error(`${logPrefix} Error parseando cuerpo JSON:`, e.message);
        return res.sendStatus(400); // Bad Request
    }

    try {
        // Procesar solo notificaciones de tipo 'payment' con ID
        if (notification?.type === 'payment' && notification.data?.id) {
            const paymentId = notification.data.id;
            console.log(`${logPrefix} 1. Procesando Pago MP ID: ${paymentId}`);

            // 2. Consultar API de MP para detalles REALES del pago
            let paymentDetails;
            try {
                console.log(`${logPrefix} 2. Consultando API MP para pago ${paymentId}...`);
                paymentDetails = await paymentClient.get({ id: paymentId });
                console.log(`   ${logPrefix} API MP Resp para ${paymentId}: Status=${paymentDetails?.status}, ExtRef=${paymentDetails?.external_reference}, Method=${paymentDetails?.payment_method_id}`);
            } catch (mpApiError) {
                console.error(`   ${logPrefix} Error consultando API MP para ${paymentId}:`, mpApiError.message, mpApiError.cause || '');
                // Si falla la consulta a la API de MP, no podemos confiar en el estado.
                // Logeamos y respondemos 200 a MP para que no reintente, pero no actualizamos nuestra DB.
                 return res.sendStatus(200);
            }

            const externalReference = paymentDetails?.external_reference; // Nuestro orderId (STRING)
            const paymentStatus = paymentDetails?.status; // Estado actual en MP
            const paidTimestamp = new Date().toISOString(); // Marca de tiempo del pago según webhook

            if (!externalReference) {
                console.error(`   ${logPrefix} Error: No 'external_reference' (orderId) en pago MP ${paymentId}.`);
                return res.sendStatus(200); // OK a MP, no podemos hacer nada si falta la referencia
            }
            // Convertir externalReference a número si tu columna 'id' en 'ventas' es serial (number)
            const orderIdNumeric = parseInt(externalReference, 10);
             // Validar que la conversión fue exitosa
             if (isNaN(orderIdNumeric)) {
                  console.error(`   ${logPrefix} Error: external_reference '${externalReference}' de MP no es un número válido.`);
                  return res.sendStatus(200); // No podemos procesar si el ID no es válido
             }


            // 3. Determinar nuevo estado DB y si actualizar movimiento
            let newDbStatus = null;
            // Para Webhook MP aprobado, SÍ actualizamos fecha_ultimo_movimiento AHORA.
            // El stock *ya fue descontado* al crear la orden en /create_order.

            if (paymentStatus === 'approved') {
                newDbStatus = 'pagada';
            } else if (['rejected', 'cancelled', 'refunded', 'charged_back'].includes(paymentStatus)) {
                newDbStatus = 'rechazada'; // O mapear a estados más específicos
            }
            // Otros estados como 'in_process' no cambian el estado final de venta.

            // 4. Actualizar DB si es necesario
            if (newDbStatus) {
                console.log(`${logPrefix} 3. Intentando actualizar orden ${externalReference} a '${newDbStatus}' (Pago MP ${paymentId})...`);
                // Actualizar SOLO si el estado actual en DB es 'pendiente' o 'procesando_mp'.
                const { data: updatedOrderArray, error: updateError } = await supabase
                    .from('ventas')
                    .update({
                        estado: newDbStatus,
                        mp_pago_id: paymentId,
                        metodo_pago_confirmado: paymentDetails?.payment_method_id || 'mercadoPagoQR',
                        fecha_pago: paidTimestamp, // Usar la fecha/hora del webhook
                    })
                    .eq('id', orderIdNumeric) // Usar el ID numérico para la consulta
                    .in('estado', ['pendiente', 'procesando_mp']) // Solo actualizar si estaba en estados 'procesando'
                    .select('id, items_json, id_farmacia, estado'); // Necesitamos items_json para actualizar movimiento

                if (updateError) {
                    console.error(`   ${logPrefix} ERROR DB al actualizar orden ${externalReference} (Pago MP ${paymentId}):`, updateError.message);
                } else if (updatedOrderArray && updatedOrderArray.length > 0) {
                    const updatedOrder = updatedOrderArray[0];
                    console.log(`   ${logPrefix} Orden ${externalReference} actualizada a '${updatedOrder.estado}' (Pago MP ${paymentId}).`);

                     // --- LÓGICA DE ACTUALIZACIÓN DE fecha_ultimo_movimiento PARA PAGOS MP APROBADOS ---
                     // SOLO si la actualización resultó en estado 'pagada'
                     if (updatedOrder.estado === 'pagada') {
                        console.log(`${logPrefix} Procesando movimiento via webhook para orden ${externalReference}.`);

                        const movementUpdateResult = await updateLastMovement(updatedOrder.items_json, paidTimestamp, logPrefix);
                        if (movementUpdateResult.errors.length > 0) {
                             console.error(`   ${logPrefix} FALLO al actualizar fecha_ultimo_movimiento (Webhook MP) para orden ${externalReference}:`, movementUpdateResult.errors);
                             const { data: currentOrderNotes } = await supabase.from('ventas').select('notas_internas').eq('id', orderIdNumeric).single();
                             const newNotes = (currentOrderNotes?.notas_internas || '') + `; Errores mov WH: ${movementUpdateResult.errors.join('; ')}`;
                             await supabase.from('ventas').update({ notas_internas: newNotes }).eq('id', orderIdNumeric);
                        } else {
                             console.log(`   ${logPrefix} Fecha_ultimo_movimiento actualizada con éxito (Webhook MP) para orden ${externalReference}.`);
                        }
                     } // Fin if updatedOrder.estado === 'pagada'

                } else {
                     console.log(`   ${logPrefix} Orden ${externalReference} no encontrada o no estaba en estado 'pendiente'/'procesando_mp'. No se actualizó estado via webhook.`);
                }
            } else {
                 console.log(`   ${logPrefix} Estado MP '${paymentStatus}' para pago ${paymentId} (orden ${externalReference}) no requiere cambio de estado final en DB.`);
            }
        } else {
            console.log(`${logPrefix} Webhook tipo '${notification?.type}' o sin data.id. Ignorado.`);
        }

        console.log(`${logPrefix} ------ Webhook Procesado. Enviando 200 OK a MP. ------`);
        res.sendStatus(200); // Siempre responder 200 OK a MP para indicar que recibimos la notificación

    } catch (webhookError) {
        console.error(`${logPrefix} ERROR CRÍTICO procesando webhook:`, webhookError.message, webhookError.stack);
        // Logeamos el error pero enviamos 500 a MP para que reintente la notificación
        res.sendStatus(500);
    }
});


// --- Ruta de Bienvenida / Health Check (Opcional) ---
app.get('/', (req, res) => {
    res.send(`
        <h1>Backend POS v5 Funcionando</h1>
        <p>Conexión Supabase: ${supabase ? 'OK' : 'FALLIDA'}</p>
        <p>Modo MP: ${isTestMode ? 'Prueba (Sandbox)' : 'Producción'}</p>
        <p>Moneda MP: ${MP_CURRENCY_ID}</p>
        <p>Webhook MP esperado en: ${process.env.MP_WEBHOOK_URL || `(no configurado, usa localhost:${port}/mercado_pago_webhook)`}</p>
        <p>Frontend debe enviar POST a /create_order.</p>
        <p>Webhook MP debe configurarse para enviar a /mercado_pago_webhook.</p>
    `);
});

// --- Iniciar el Servidor Express ---
app.listen(port, () => {
    console.log(`\n🚀 Servidor Node.js corriendo en http://localhost:${port}`);
    console.log(`   Modo MP: ${isTestMode ? 'Prueba (Sandbox)' : 'Producción'}`);
    console.log(`  Moneda MP: ${MP_CURRENCY_ID}`);
    if (supabase && supabaseUrl) {
        const supabaseDomain = supabaseUrl.split('//')[1]?.split('.')[0];
        console.log(`  Supabase Conectado: ${supabaseDomain || '(URL no parseable)'}.supabase.co`);
    } else {
        console.log(`  Supabase: Conexión Fallida o URL no disponible.`);
    }
    const webhookUrl = process.env.MP_WEBHOOK_URL || `http://localhost:${port}/mercado_pago_webhook (¡Configura MP_WEBHOOK_URL en .env para producción!)`;
    console.log(`  Webhook MP esperado en: ${webhookUrl}`);
    console.log("\n------ Servidor Listo ------\n");
});


// --- Recordatorio: Función RPC 'descontar_stock' necesaria en Supabase ---
/*
-- Asegúrate de haber ejecutado esto en tu Editor SQL de Supabase:
-- (Tu definición actual de la función descontar_stock)
CREATE OR REPLACE FUNCTION descontar_stock(
    item_upc text,
    cantidad_a_descontar int,
    farmacia_id_param int -- O bigint, uuid, text según tu columna id_farmacia en 'medicamentos'
)
RETURNS void
LANGUAGE plpgsql
AS $$
-- ... contenido de la función ...
$$;

-- Y asegúrate de haber añadido la columna a 'medicamentos'
-- ALTER TABLE public.medicamentos ADD COLUMN fecha_ultimo_movimiento timestamp with time zone NULL;

-- Y ELIMINA ESTE TRIGGER si lo creaste antes, porque la actualización se hace ahora en el backend
-- DROP TRIGGER IF EXISTS trg_update_last_movement ON public.ventas;
*/
