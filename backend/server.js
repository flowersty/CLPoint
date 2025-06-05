
// backend/server.js (v5 con Tarjeta + FIX LOGGING + FIX RECETAS)

require('dotenv').config(); // Carga variables de ./backend/.env
const express = require('express');
const { MercadoPagoConfig, Preference, Payment } = require('mercadopago');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const port = process.env.PORT || 3000;

// --- Configuración de Supabase (Backend con Service Role Key) ---
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY; // ¡Clave secreta para operaciones sensibles!
if (!supabaseUrl || !supabaseKey) {
    console.error("\n⛔ ERROR CRÍTICO: Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en backend/.env!\n");
    process.exit(1); // Detener el servidor si faltan credenciales
}
const supabase = createClient(supabaseUrl, supabaseKey, {
    // Opciones adicionales si son necesarias, ej:
    // auth: {
    //     persistSession: false // No mantener sesión en el backend
    // }
});
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
    console.log(`\n➡️  ${req.method} ${req.path}`);
    // Asegura que req.body existe y es un objeto antes de intentar Object.keys()
    if (req.body && Object.keys(req.body).length > 0 && req.path !== '/mercado_pago_webhook') {
        // Loggea todo el body excepto el binario del webhook
        console.log("   Body:", JSON.stringify(req.body, null, 2)); // Usar null, 2 para formato legible
    }
    next();
});


// --- Función Auxiliar para Descontar Stock (Usa RPC con id_farmacia) ---
// Recibe el ID de la orden (para logs/notas) y la lista de items del carrito.
// ASUME que cada 'item' en la lista tiene 'upc', 'cantidad', y 'id_farmacia'.
async function deductStockForOrder(orderId, items) {
    const functionName = `[Stock Deduct Order ${orderId}]`; // Prefijo para logs
    console.log(`${functionName} Iniciando deducción para ${items.length} tipos de items.`);
    let allSucceeded = true; // Flag general
    const errors = []; // Acumulador de errores por item

    // Primero, agrupar cantidades por UPC y Farmacia para evitar descontar doble
    const deductionMap = new Map(); // Key: `upc|farmacia_id`, Value: total_cantidad
    for (const item of items) {
        const key = `${item.upc}|${item.id_farmacia}`;
        const currentAmount = deductionMap.get(key) || 0;
        deductionMap.set(key, currentAmount + (item.cantidad || 0));
    }

     if (deductionMap.size === 0) {
         console.warn(`${functionName} No hay items válidos para descontar stock.`);
         // Aunque no haya items, esto no es necesariamente un fallo si el carrito estaba vacío (validación previa debería evitar esto)
         return { success: true, errors: ["No items processed for stock deduction."] };
     }


    // Iterar sobre el mapa agrupado para llamar a la RPC una vez por combinación única UPC/Farmacia
    for (const [key, totalQuantity] of deductionMap.entries()) {
        const [upc, farmacia_id_str] = key.split('|');
        const farmacia_id = parseInt(farmacia_id_str, 10); // Convertir a número si id_farmacia es numérico en DB

         // Validar datos agrupados (aunque la validación previa debería cubrirlos)
        if (!upc || isNaN(farmacia_id) || totalQuantity <= 0) {
             console.warn(`${functionName} Datos agrupados inválidos omitidos: Key=${key}, TotalQty=${totalQuantity}`);
             errors.push(`Datos agrupados inválidos: ${key}`);
             allSucceeded = false;
             continue;
        }


        try {
            // Llamar a la función RPC 'descontar_stock' en Supabase
            console.log(`   ${functionName} Llamando RPC: descontar_stock(upc=${upc}, cantidad=${totalQuantity}, farmacia=${farmacia_id})`);
            const { error: rpcError } = await supabase.rpc('descontar_stock', {
                 item_upc: upc,
                 cantidad_a_descontar: totalQuantity,
                 farmacia_id_param: farmacia_id
            });

            // Manejar errores devueltos explícitamente por la función RPC (RAISE EXCEPTION)
            if (rpcError) {
                 console.error(`   ${functionName} ERROR RPC (UPC ${upc}, Farm ${farmacia_id}):`, rpcError.message);
                 // Re-lanzar para que el catch general lo capture y lo añada a 'errors'
                 throw new Error(`Stock insuficiente/Error DB para UPC ${upc} (Farmacia ${farmacia_id}): ${rpcError.message}`);
            }

            console.log(`   ${functionName} Éxito RPC (UPC ${upc}, Farm ${farmacia_id}).`);

        } catch (error) {
            // Capturar errores (lanzados desde la RPC o errores de conexión/inesperados)
            console.error(`   ${functionName} FALLO (UPC ${upc}, Farm ${farmacia_id}):`, error.message || error);
            allSucceeded = false; // Marcar fallo general
            // Usar el mensaje de error detallado capturado
            errors.push(error.message || `Error desconocido al descontar stock para UPC ${upc} / Farmacia ${farmacia_id}.`);
        }
    } // Fin del bucle for sobre deductionMap

    // Actualizar las notas internas en la tabla 'ventas' con el resultado
    const finalNote = allSucceeded
        ? `✅ Stock descontado correctamente via RPC. (${new Date().toISOString()})`
        : `❌ ERRORES al descontar stock via RPC: ${errors.join('; ')} (${new Date().toISOString()})`;
    try {
        console.log(`${functionName} Actualizando notas_internas...`);
        const { error: noteUpdateError } = await supabase
            .from('ventas')
            .update({ notas_internas: finalNote })
            .eq('id', orderId);
        if (noteUpdateError) {
            console.error(`${functionName} Error actualizando notas_internas:`, noteUpdateError.message);
            // No se considera un fallo crítico para la función principal
        }
    } catch (e) {
        console.error(`${functionName} Excepción actualizando notas_internas:`, e);
    }

    console.log(`${functionName} Resultado final deducción stock: success=${allSucceeded}, errors count=${errors.length}`);
    // Devolver si la operación general fue exitosa y la lista de errores si hubo
    return { success: allSucceeded, errors: errors };
}


// --- Rutas Principales ---

/**
 * POST /create_order
 * Recibe los detalles de la venta desde el frontend.
 * 1. Crea un registro en la tabla 'ventas' (guardando id_farmacia, items, etc.).
 * 2. SI RECIBE prescription_update_data, intenta actualizar la receta.
 * 3. Si es 'mercadoPagoQR', crea una preferencia de pago en MP y devuelve la URL.
 * 4. Si es 'efectivo' o 'tarjeta', intenta descontar el stock y actualiza el estado de la venta a 'pagada'.
 * Devuelve el ID de la orden y detalles relevantes (URL de MP o resultado de stock).
 */
app.post('/create_order', async (req, res) => {
    const start = Date.now(); // Para medir tiempo (opcional)
    // Extraer datos del cuerpo de la solicitud, incluyendo el nuevo campo de receta
    const { amount, description, paciente_id, compra_sin_cuenta, cartItems, id_farmacia, payment_method, prescription_update_data } = req.body;
    const logPrefix = `[Create Order Req ${Date.now().toString().slice(-5)}]`; // Identificador único para logs

    console.log(`${logPrefix} Recibido: Method=${payment_method}, Farmacia=${id_farmacia}, Amount=${amount}, Items=${cartItems?.length}`);
    // El middleware ya loggea el body completo

    // --- Validaciones de Entrada ---
    if (!amount || typeof amount !== 'number' || amount <= 0) {
        console.warn(`${logPrefix} Rechazado: Monto inválido.`);
        return res.status(400).json({ message: 'Monto inválido.' });
    }
    if (!payment_method || (payment_method !== 'efectivo' && payment_method !== 'mercadoPagoQR' && payment_method !== 'tarjeta')) {
        console.warn(`${logPrefix} Rechazado: Método de pago inválido.`);
         return res.status(400).json({ message: 'Método de pago inválido o faltante.' });
    }
     if (id_farmacia === undefined || id_farmacia === null) { // Chequeo más estricto
        console.warn(`${logPrefix} Rechazado: Falta ID de farmacia.`);
         return res.status(400).json({ message: 'Falta ID de farmacia.' });
     }
     if (!cartItems || !Array.isArray(cartItems) || cartItems.length === 0) {
        console.warn(`${logPrefix} Rechazado: Carrito vacío o inválido.`);
        return res.status(400).json({ message: 'El carrito está vacío o es inválido.' });
     }
     // Validar consistencia de id_farmacia
     if (!cartItems.every(item => item.id_farmacia !== undefined && item.id_farmacia !== null && item.id_farmacia == id_farmacia)) {
         console.warn(`${logPrefix} Rechazado: Inconsistencia o falta de ID de farmacia en los items del carrito.`);
         return res.status(400).json({ message: 'Error interno: Inconsistencia o faltan datos de farmacia en los items del carrito.' });
     }

    const finalDescription = description || `Compra POS ${new Date().toISOString()}`;
    let orderId = null; // ID de la orden que se creará

    // --- 1. Crear la Orden en Supabase (tabla 'ventas') ---
    console.log(`${logPrefix} 1. Creando registro en tabla 'ventas'...`);
    try {
        let initialState;
        if (payment_method === 'mercadoPagoQR') {
            initialState = 'pendiente';
        } else if (payment_method === 'efectivo') {
            initialState = 'procesando_efectivo'; // Nuevo estado intermedio
        } else if (payment_method === 'tarjeta') {
            initialState = 'procesando_tarjeta'; // Nuevo estado intermedio
        } else {
            initialState = 'desconocido'; // Fallback - aunque ya se valida antes
        }

        const { data: newOrderData, error: insertError } = await supabase
            .from('ventas')
            .insert({
                monto_total: amount,
                descripcion: finalDescription,
                estado: initialState,
                metodo_pago_solicitado: payment_method,
                paciente_id: paciente_id || null,
                compra_sin_cuenta: Boolean(compra_sin_cuenta), // Asegurar booleano
                items_json: cartItems, // Guardar los items como JSON
                id_farmacia: id_farmacia, // Guardar el ID de la farmacia que hizo la venta
                 // Opcional: guardar referencia a la receta en la venta si existe
                 receta_asociada_id: prescription_update_data?.receta_id || null
            })
            .select('id') // Devolver el ID de la nueva orden
            .single(); // Esperamos solo una

        if (insertError) { throw insertError; }

        orderId = newOrderData.id;
        console.log(`   ${logPrefix} Orden ${orderId} creada en DB (Estado: ${initialState}).`);

    } catch (dbError) {
        console.error(`   ${logPrefix} FALLO Crítico al insertar venta en DB:`, dbError.message);
        // Si falla la creación de la venta, no podemos continuar
        return res.status(500).json({ message: `Error interno (DB): No se pudo crear el registro de venta.`, details: dbError.message });
    }

    // --- NUEVO: Intentar actualizar la Receta si los datos existen ---
    if (prescription_update_data && prescription_update_data.receta_id) {
        console.log(`${logPrefix} 2. Intentando actualizar Receta ID: ${prescription_update_data.receta_id}...`);
        try {
            const { data: updatedReceta, error: updateRecetaError } = await supabase
                .from('recetas')
                .update({
                    estado_dispensacion: prescription_update_data.estado_dispensacion, // 'dispensada' o 'incompleta'
                    medicamentos_dispensados_detalle: prescription_update_data.medicamentos_dispensados_detalle,
                    fecha_dispensacion: new Date().toISOString() // Añadir fecha de dispensación si tu esquema la tiene
                })
                .eq('id', prescription_update_data.receta_id)
                 // Opcional: Podrías añadir .eq('estado_dispensacion', 'no dispensada') o 'incompleta'
                 // para asegurar que solo actualizas recetas que aún no están marcadas como completas.
                 // Pero si tu frontend ya filtra, quizás no sea estrictamente necesario aquí.
                .select('id, estado_dispensacion'); // Selecciona algo para verificar si se actualizó

            if (updateRecetaError) {
                console.error(`   ${logPrefix} ERROR al actualizar Receta ${prescription_update_data.receta_id}:`, updateRecetaError.message);
                // NO lanzamos error aquí porque la venta principal SÍ se creó.
                // Podríamos añadir una nota a la venta creada indicando este fallo.
                await supabase.from('ventas').update({
                    notas_internas: `Error al actualizar receta ${prescription_update_data.receta_id}: ${updateRecetaError.message}`
                }).eq('id', orderId);
                 console.warn(`${logPrefix} Venta ${orderId} creada, pero fallo al actualizar receta. Continuar con respuesta exitosa de venta.`);

            } else if (!updatedReceta || updatedReceta.length === 0) {
                 console.warn(`   ${logPrefix} UPDATE de Receta ${prescription_update_data.receta_id} no afectó filas (quizás ID incorrecto o ya estaba dispensada).`);
                 // También podrías loggear esto en notas_internas si quieres
            }
            else {
                console.log(`   ${logPrefix} Receta ${prescription_update_data.receta_id} actualizada a estado: ${updatedReceta[0].estado_dispensacion}.`);
            }
        } catch (recetaUpdateException) {
             console.error(`   ${logPrefix} EXCEPCIÓN al actualizar Receta ${prescription_update_data.receta_id}:`, recetaUpdateException);
             await supabase.from('ventas').update({
                 notas_internas: `Excepción al actualizar receta ${prescription_update_data.receta_id}: ${recetaUpdateException.message || 'Desconocido'}`
             }).eq('id', orderId);
              console.warn(`${logPrefix} Venta ${orderId} creada, pero excepción al actualizar receta. Continuar con respuesta exitosa de venta.`);
        }
    } else {
        console.log(`${logPrefix} No se recibió prescription_update_data válido. Omitiendo actualización de receta.`);
    }
     // --- Fin Lógica de Receta ---


    // --- 3. Lógica según Método de Pago (Original, ahora paso 3/4) ---

    // A) Mercado Pago QR (Paso 3)
    if (payment_method === 'mercadoPagoQR') {
        console.log(`${logPrefix} 3. Creando Preferencia MP para orden ${orderId}...`);
        const preferenceData = {
            items: [{ id: `order_${orderId}`, title: finalDescription.substring(0, 250), quantity: 1, currency_id: MP_CURRENCY_ID, unit_price: amount }],
            external_reference: orderId.toString(), // ID de nuestra venta
            purpose: 'wallet_purchase',
            notification_url: process.env.MP_WEBHOOK_URL, // URL donde MP nos notificará
        };
        try {
            const result = await preference.create({ body: preferenceData });
            const paymentUrl = isTestMode ? result.sandbox_init_point : result.init_point;
            const mpPreferenceId = result.id;

            if (!paymentUrl || !mpPreferenceId) throw new Error('MP no devolvió URL de pago o ID de preferencia.');
            console.log(`      ${logPrefix} Pref MP ${mpPreferenceId} creada para orden ${orderId}.`);

            // Actualizar orden con Pref ID (Opcional, ya lo hicimos al crear)
            // console.log(`${logPrefix} Actualizando orden ${orderId} con Pref ID ${mpPreferenceId}...`);
            // Ya lo hicimos al crear, podrías refinar esto si necesitas guardar más detalles de la preferencia.

            // 4. Devolver URL y OrderID al frontend
            console.log(`${logPrefix} 4. Éxito MP QR. Enviando URL y OrderID ${orderId}. Tiempo: ${Date.now() - start}ms`);
            return res.json({ init_point_url: paymentUrl, order_id: orderId });

        } catch (mpError) {
            console.error(`   ${logPrefix} ERROR creando Preferencia MP para orden ${orderId}:`, mpError.message, mpError.cause);
            // Marcar orden con error MP
            await supabase.from('ventas').update({ estado: 'error_mp', notas_internas: `Error MP Pref: ${mpError.message}` }).eq('id', orderId);
            const apiStatus = mpError.cause?.apiResponse?.status || 500;
            // Devolver error al frontend
            return res.status(apiStatus).json({ message: mpError.message || 'Error al crear preferencia MP.' });
        }
    }

    // B) Efectivo O Tarjeta (Paso 3/4)
    else if (payment_method === 'efectivo' || payment_method === 'tarjeta') {
        console.log(`${logPrefix} 3. Procesando Venta ${payment_method} para orden ${orderId}. Descontando stock...`);
        // Descontar stock inmediatamente para estos métodos
        const deductionResult = await deductStockForOrder(orderId, cartItems);

        // 4. Actualizar estado de la venta en 'ventas'
        if (deductionResult.success) {
            console.log(`   ${logPrefix} Stock descontado. Marcando orden ${orderId} como 'pagada'.`);
            try {
                const { error: updateStatusError } = await supabase.from('ventas').update({
                    estado: 'pagada', // Estado final si todo va bien
                    metodo_pago_confirmado: payment_method, // Confirmar con el método recibido
                    fecha_pago: new Date().toISOString(), // Registrar fecha de pago
                    last_updated_at: new Date().toISOString()
                }).eq('id', orderId);
                if (updateStatusError) throw updateStatusError;

                // Éxito total
                console.log(`   ${logPrefix} Orden ${orderId} completada (${payment_method}). Tiempo: ${Date.now() - start}ms`);
                return res.status(200).json({
                    message: `Venta por ${payment_method} registrada y stock descontado.`,
                    orderId: orderId,
                    receipt_number: orderId // Devolver ID como recibo
                });
            } catch (updateError) {
                console.error(`   ${logPrefix} ERROR al marcar orden ${orderId} como 'pagada':`, updateError.message);
                 // La venta se hizo y el stock se descontó, pero falló la actualización FINAL.
                 // Esto es raro, pero posible. Devolvemos 207 (Multi-Status) o un error 500
                 // indicando que la venta *se hizo* pero hubo un problema al registrar el estado final.
                 // Para no confundir al frontend que espera un éxito total para resetear,
                 // podríamos considerar lanzar un error 500, o loggear esto como crítico
                 // y dejar que el frontend resetee, sabiendo que el estado DB está mal.
                 // Optemos por lanzar un error para que el frontend sepa que algo falló al FINAL.
                 // Esto puede requerir manejo adicional en el frontend si se quiere diferenciar.
                 // Alternativa más simple para coincidir con frontend: devolver 200 y loggear crítico.
                 // Vamos con la alternativa simple para mantener la lógica actual del frontend.
                await supabase.from('ventas').update({
                    notas_internas: (await supabase.from('ventas').select('notas_internas').eq('id', orderId).single()).data?.notas_internas + `; Error final update estado: ${updateError.message}` // Añadir a notas existentes
                }).eq('id', orderId);
                 console.error(`${logPrefix} CRÍTICO: Orden ${orderId} completada, stock descontado, pero fallo al marcar estado final 'pagada'.`);
                 return res.status(200).json({ // Devolver 200 para que el frontend resetee, pero loggear el error
                     message: `Venta completada con ${payment_method}, pero hubo un error al registrar el estado final.`,
                     orderId: orderId,
                     receipt_number: orderId
                 });
            }
        } else {
            // Si hubo errores al descontar stock (esto es un fallo de la venta)
            console.error(`   ${logPrefix} FALLO al descontar stock para orden ${orderId}:`, deductionResult.errors);
            // Marcar la orden con error de stock (ya se hace en deductStockForOrder a través de notas_internas)
            await supabase.from('ventas').update({
                estado: 'error_stock', // Nuevo estado: error de stock
                metodo_pago_confirmado: null, // No se confirmó el pago
                fecha_pago: null,
                last_updated_at: new Date().toISOString()
            }).eq('id', orderId);
            // Devolver error 409 (Conflict) al frontend indicando el problema de stock
            return res.status(409).json({
                 message: `No se pudo completar la venta por ${payment_method} debido a errores de stock.`,
                 orderId: orderId,
                 stockErrors: deductionResult.errors // Pasar los errores de stock específicos
            });
        }
    }
});


/**
 * POST /mercado_pago_webhook (Sin cambios en esta sección, pero la actualizo con logs consistentes)
 * Recibe notificaciones de Mercado Pago sobre el estado de los pagos.
 * 1. Valida el tipo de notificación.
 * 2. Consulta la API de MP para obtener el estado real del pago.
 * 3. Actualiza el estado de la orden correspondiente en la base de datos.
 * 4. Si el pago fue aprobado ('approved') y la orden estaba 'pendiente', descuenta el stock.
 * Responde 200 OK a Mercado Pago para confirmar la recepción.
 */
app.post('/mercado_pago_webhook', async (req, res) => {
    const logPrefix = `[MP Webhook ${Date.now().toString().slice(-5)}]`;
    console.log(`\n${logPrefix} ------ Webhook MP Recibido ------`);
    // TODO: Implementar validación de X-Signature para seguridad seria

    let notification;
    try {
        // Asegúrate de que req.body sea un Buffer o similar y parseable
        notification = JSON.parse(req.body.toString());
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
            console.log(`${logPrefix} 2. Consultando API MP para pago ${paymentId}...`);
            let paymentDetails;
            try {
                paymentDetails = await paymentClient.get({ id: paymentId });
                console.log(`   ${logPrefix} API MP Resp para ${paymentId}: Status=${paymentDetails?.status}, ExtRef=${paymentDetails?.external_reference}, Method=${paymentDetails?.payment_method_id}`);
            } catch (mpApiError) {
                console.error(`   ${logPrefix} Error consultando API MP para ${paymentId}:`, mpApiError.message);
                return res.sendStatus(200); // OK a MP para que no reintente si falló nuestra consulta API
            }

            const externalReference = paymentDetails?.external_reference; // Nuestro orderId
            const paymentStatus = paymentDetails?.status; // Estado actual en MP

            if (!externalReference) {
                console.error(`   ${logPrefix} Error: No 'external_reference' en pago MP ${paymentId}.`);
                return res.sendStatus(200); // OK a MP, no podemos hacer nada si falta la referencia
            }

            // 3. Determinar nuevo estado DB y si descontar stock
            let newDbStatus = null;
            let shouldDeductStock = false; // Descontar stock SOLO si se aprueba y aún no se hizo

            if (paymentStatus === 'approved') {
                newDbStatus = 'pagada';
                shouldDeductStock = true; // Descontar stock solo si pasa a aprobado
            } else if (['rejected', 'cancelled', 'refunded', 'charged_back'].includes(paymentStatus)) {
                newDbStatus = 'rechazada'; // O mapear a estados más específicos
                shouldDeductStock = false; // No descontar stock si se rechaza/cancela
            }
            // Otros estados como 'in_process' no cambian el estado final de venta, solo se loggean si se desea.

            // 4. Actualizar DB si es necesario
            if (newDbStatus) {
                console.log(`${logPrefix} 3. Intentando actualizar orden ${externalReference} a '${newDbStatus}' (Pago MP ${paymentId})...`);
                // Actualizar SOLO si el estado actual en DB es 'pendiente' o 'procesando_mp'
                // Esto previene doble procesamiento si el webhook se reenvía
                const { data: updatedOrder, error: updateError } = await supabase
                    .from('ventas')
                    .update({
                        estado: newDbStatus,
                        mp_pago_id: paymentId,
                        metodo_pago_confirmado: paymentDetails?.payment_method_id || 'mercadoPago',
                        fecha_pago: new Date().toISOString(), // Registrar fecha de pago real
                        last_updated_at: new Date().toISOString()
                    })
                    .eq('id', externalReference)
                    .in('estado', ['pendiente', 'procesando_mp']) // Actualizar solo si estaba en estos estados
                    .select('id, items_json, id_farmacia, estado, receta_asociada_id') // Necesitamos items, farmacia, estado actual y receta
                    .single();

                if (updateError) {
                    console.error(`   ${logPrefix} ERROR DB al actualizar orden ${externalReference} (Pago MP ${paymentId}):`, updateError.message);
                    // Loggear error pero aún así enviar 200 a MP.
                } else if (updatedOrder && shouldDeductStock && updatedOrder.estado !== 'pagada') {
                    // Si se actualizó a 'pagada' (y shouldDeductStock es true)
                    // Y la orden *no* estaba ya pagada antes de esta actualización
                    console.log(`   ${logPrefix} Orden ${externalReference} marcada como '${newDbStatus}'. Procediendo a descontar stock...`);

                    // 5. Descontar Stock (Si no se hizo antes y si aplica)
                    const deductionResult = await deductStockForOrder(externalReference, updatedOrder.items_json);
                    if (!deductionResult.success) {
                        console.error(`   ${logPrefix} FALLO al descontar stock (Webhook MP) para orden ${externalReference}:`, deductionResult.errors);
                         // Stock falló después del pago. Esto requiere intervención.
                         // Marcar la orden con un estado de error post-pago si es posible
                         await supabase.from('ventas').update({
                             estado: 'pagada_stock_fallido', // Nuevo estado: pagada, pero stock falló
                             notas_internas: (await supabase.from('ventas').select('notas_internas').eq('id', externalReference).single()).data?.notas_internas + `; FALLO STOCK Webhook MP: ${deductionResult.errors.join('; ')}`
                         }).eq('id', externalReference);
                    } else {
                         console.log(`   ${logPrefix} Stock descontado con éxito (Webhook MP) para orden ${externalReference}.`);
                         // Si había una receta asociada a esta venta, ¿deberíamos actualizarla aquí también?
                         // Sí, si no se actualizó en el /create_order inicial (ej: si /create_order fue solo para MP QR)
                         // Esto requiere guardar el prescription_update_data original en la venta o reconstruirlo.
                         // ALTERNATIVA: Asegurar que /create_order siempre intenta actualizar la receta,
                         // y si es MP, la actualización de estado a 'pagada' y stock se hace aquí en el webhook.
                         // La lógica actual del frontend envía `prescription_update_data` en `/create_order`.
                         // Si el backend falla al actualizar la receta en `/create_order` (por RLS o lo que sea),
                         // este webhook *no* lo arreglará porque no tiene esa información.
                         // => La lógica de actualización de receta DEBE estar sólida en /create_order.
                         // Este webhook solo confirma pago y descuenta stock para MP.
                    }
                } else if (updatedOrder && updatedOrder.estado === 'pagada') {
                    console.log(`   ${logPrefix} Orden ${externalReference} ya estaba marcada como 'pagada'. No se realizan acciones adicionales.`);
                } else {
                     console.log(`   ${logPrefix} Orden ${externalReference} no requirió acción de stock tras actualización a '${newDbStatus}'.`);
                }
            } else {
                console.log(`   ${logPrefix} Estado MP '${paymentStatus}' para pago ${paymentId} (orden ${externalReference}) no requiere cambio de estado en DB.`);
            }
        } else {
            console.log(`${logPrefix} Webhook tipo '${notification?.type}' o sin data.id. Ignorado.`);
        }

        // Siempre responder 200 OK a Mercado Pago para indicar que recibimos el webhook
        console.log(`${logPrefix} ------ Webhook Procesado. Enviando 200 OK a MP. ------`);
        res.sendStatus(200);

    } catch (webhookError) {
        console.error(`${logPrefix} ERROR CRÍTICO procesando webhook:`, webhookError.message, webhookError.stack);
        res.sendStatus(500); // Internal Server Error a MP para que reintente
    }
});


// --- Ruta de Bienvenida / Health Check (Opcional) ---
app.get('/', (req, res) => {
    res.send(`
        <h1>Backend POS v4 Funcionando</h1>
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
    if (supabase) console.log(`  Supabase Conectado: ${supabaseUrl.split('//')[1].split('.')[0]}.supabase.co`); // Parsear URL mejor para mostrar el subdominio
    console.log(`  Webhook MP esperado en: ${process.env.MP_WEBHOOK_URL || `http://localhost:${port}/mercado_pago_webhook (¡Configura MP_WEBHOOK_URL en .env!)`}`);
    console.log("\n------ Servidor Listo ------\n");
});


// --- Recordatorio: Función RPC 'descontar_stock' necesaria en Supabase ---
/*
-- Asegúrate de haber ejecutado esto en tu Editor SQL de Supabase:

CREATE OR REPLACE FUNCTION descontar_stock(
    item_upc text,
    cantidad_a_descontar int,
    farmacia_id_param int -- O bigint, uuid, text según tu columna id_farmacia
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  stock_actual int;
BEGIN
  -- Bloquear la fila ESPECÍFICA de ese UPC en ESA farmacia para evitar concurrencia
  SELECT unidades INTO stock_actual
  FROM medicamentos
  WHERE upc = item_upc AND id_farmacia = farmacia_id_param
  FOR UPDATE; -- Bloqueo a nivel de fila (Row-Level Lock)

  -- Si no se encontró la combinación exacta (UPC + Farmacia)
  IF NOT FOUND THEN
    -- Usar RAISE EXCEPTION para detener la transacción y notificar el fallo
    RAISE EXCEPTION 'Medicamento con UPC ''%'' no encontrado en la farmacia ID ''%'' para descuento de stock.', item_upc, farmacia_id_param;
  END IF;

  -- Verificar si hay suficiente stock
  IF stock_actual < cantidad_a_descontar THEN
    -- Usar RAISE EXCEPTION para detener la transacción si el stock es insuficiente
    RAISE EXCEPTION 'Stock insuficiente para UPC ''%'' en farmacia ID ''%'' para descontar % unidades. Stock actual: %', item_upc, farmacia_id_param, cantidad_a_descontar, stock_actual;
  END IF;

  -- Realizar el descuento si hay stock suficiente
  UPDATE medicamentos
  SET unidades = unidades - cantidad_a_descontar
  WHERE upc = item_upc AND id_farmacia = farmacia_id_param; -- Asegurar que se actualiza la fila correcta

  -- Opcional: Dejar un mensaje de aviso en los logs de Postgres (no detiene la transacción)
  -- RAISE NOTICE 'Stock descontado para UPC ''%'' en farmacia ID ''%'': % unidades. Nuevo stock: %', item_upc, farmacia_id_param, cantidad_a_descontar, stock_actual - cantidad_a_descontar;

END;
$$;

-- Nota sobre la RPC:
-- - La cláusula `FOR UPDATE` es CRUCIAL para manejar concurrencia. Evita que dos ventas
--   descuenten stock del mismo medicamento en la misma farmacia al mismo tiempo incorrectamente.
-- - `RAISE EXCEPTION` detiene la ejecución de la función RPC y propaga un error.
--   Tu código de backend debe CAPTURAR este error (`const { error } = await supabase.rpc(...)`)
--   para saber que la deducción falló y manejarlo (ej: no marcar la venta como pagada, devolver error al frontend).
-- - La función actual devuelve `void` (nada). Podrías modificarla para devolver el nuevo stock,
--   un booleano de éxito, o el mensaje de error si usas `RAISE WARNING` en lugar de `EXCEPTION`,
--   pero con `EXCEPTION` el error ya se propaga automáticamente.
*/

