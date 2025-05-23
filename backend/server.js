// backend/server.js (COMPLETO Y FINAL - v4)
// Incluye: Descuento stock por farmacia, guarda id_farmacia en ventas, manejo MP, Efectivo y Tarjeta

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
// Middleware simple para loggear cada petición recibida (opcional)
app.use((req, res, next) => {
    console.log(`\n➡️  ${req.method} ${req.path}`);
    if (Object.keys(req.body).length > 0 && req.path !== '/mercado_pago_webhook') { // No loggear cuerpo raw del webhook
        console.log("   Body:", JSON.stringify(req.body));
    }
    next();
});


// --- Función Auxiliar para Descontar Stock (Usa RPC con id_farmacia) ---
// Recibe el ID de la orden (para logs/notas) y la lista de items del carrito.
// ASUME que cada 'item' en la lista tiene 'upc', 'cantidad', y 'id_farmacia'.
async function deductStockForOrder(orderId, items) {
    const functionName = `[Stock Deduct Order ${orderId}]`; // Prefijo para logs
    if (!supabase || !items || !Array.isArray(items) || items.length === 0) {
        console.warn(`${functionName} Supabase no disponible o items inválidos/vacíos.`);
        return { success: false, error: "Configuración o datos inválidos para descontar stock." };
    }
    console.log(`${functionName} Iniciando deducción para ${items.length} tipos de items.`);
    let allSucceeded = true; // Flag general
    const errors = []; // Acumulador de errores por item

    for (const item of items) {
        const { upc, cantidad, id_farmacia } = item; // Extraer datos clave

        // Validar datos de este item específico
        if (!upc || !cantidad || cantidad <= 0 || id_farmacia === undefined || id_farmacia === null) {
            const invalidItemInfo = `UPC: ${upc ?? 'N/A'}, Cant: ${cantidad ?? 'N/A'}, Farmacia: ${id_farmacia ?? 'N/A'}`;
            console.warn(`${functionName} Item inválido omitido: ${invalidItemInfo}`);
            errors.push(`Item inválido: ${invalidItemInfo}`);
            allSucceeded = false; // Considerar un item inválido como fallo
            continue; // Pasar al siguiente item
        }

        try {
            // Llamar a la función RPC 'descontar_stock' en Supabase
            console.log(`   ${functionName} Llamando RPC: descontar_stock(upc=${upc}, cantidad=${cantidad}, farmacia=${id_farmacia})`);
            const { error: rpcError } = await supabase.rpc('descontar_stock', {
                 item_upc: upc,                 // Parámetro 1 para la función SQL
                 cantidad_a_descontar: cantidad, // Parámetro 2 para la función SQL
                 farmacia_id_param: id_farmacia  // Parámetro 3 para la función SQL
            });

            // Manejar errores devueltos explícitamente por la función RPC (RAISE EXCEPTION)
            if (rpcError) {
                 console.error(`   ${functionName} ERROR RPC (UPC ${upc}, Farm ${id_farmacia}):`, rpcError.message);
                 // Re-lanzar para que el catch general lo capture y lo añada a 'errors'
                 throw new Error(`UPC ${upc} (F${id_farmacia}): ${rpcError.message}`);
            }

            // Si la RPC solo lanzó WARNING (ej. stock insuficiente pero no detuvo), no habrá rpcError aquí.
            // El NOTICE sí debería aparecer en los logs de Supabase/PostgreSQL.
            console.log(`   ${functionName} Éxito RPC (UPC ${upc}, Farm ${id_farmacia}).`);

        } catch (error) {
            // Capturar errores (lanzados desde la RPC o errores de conexión/inesperados)
            console.error(`   ${functionName} FALLO (UPC ${upc}, Farm ${id_farmacia}):`, error.message || error);
            allSucceeded = false; // Marcar fallo general
            // Usar el mensaje de error detallado capturado
            errors.push(error.message || `Error desconocido en UPC ${upc} / Farmacia ${id_farmacia}.`);
        }
    } // Fin del bucle for

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

    console.log(`${functionName} Resultado final: success=${allSucceeded}, errors=${errors.length}`);
    // Devolver si la operación general fue exitosa y la lista de errores si hubo
    return { success: allSucceeded, errors: errors };
}


// --- Rutas Principales ---

/**
 * POST /create_order
 * Recibe los detalles de la venta desde el frontend.
 * 1. Crea un registro en la tabla 'ventas' (guardando id_farmacia).
 * 2. Si es 'mercadoPagoQR', crea una preferencia de pago en MP y devuelve la URL.
 * 3. Si es 'efectivo' o 'tarjeta', intenta descontar el stock y actualiza el estado de la venta.
 * Devuelve el ID de la orden y detalles relevantes (URL de MP o resultado de stock).
 */
app.post('/create_order', async (req, res) => {
    const start = Date.now(); // Para medir tiempo (opcional)
    // Extraer datos del cuerpo de la solicitud
    const { amount, description, paciente_id, compra_sin_cuenta, cartItems, id_farmacia, payment_method } = req.body;
    const logPrefix = `[Create Order Req ${Date.now().toString().slice(-5)}]`; // Identificador único para logs

    console.log(`${logPrefix} Recibido: Method=${payment_method}, Farmacia=${id_farmacia}, Amount=${amount}, Items=${cartItems?.length}`);

    // --- Validaciones de Entrada ---
    if (!amount || typeof amount !== 'number' || amount <= 0) {
        console.warn(`${logPrefix} Rechazado: Monto inválido.`);
        return res.status(400).json({ message: 'Monto inválido.' });
    }
    // CAMBIO: Añadir 'tarjeta' a los métodos de pago válidos
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
     // Validar que cada item en cartItems tenga id_farmacia (crucial para el descuento)
     if (!cartItems.every(item => item.id_farmacia !== undefined && item.id_farmacia !== null)) {
         console.warn(`${logPrefix} Rechazado: Algunos items del carrito no tienen id_farmacia.`);
         return res.status(400).json({ message: 'Error interno: Faltan datos de farmacia en los items del carrito.' });
     }
     // Validar que el id_farmacia general coincida con el de los items (consistencia)
     if (!cartItems.every(item => item.id_farmacia == id_farmacia)) { // Usar == por si vienen como string/number
         console.warn(`${logPrefix} Rechazado: Inconsistencia en ID de farmacia entre la orden y los items.`);
         return res.status(400).json({ message: 'Error interno: Inconsistencia en los datos de la farmacia.' });
     }

    const finalDescription = description || `Compra POS ${new Date().toISOString()}`;
    let orderId = null; // ID de la orden que se creará

    // --- 1. Crear la Orden en Supabase ---
    console.log(`${logPrefix} 1. Creando registro en tabla 'ventas'...`);
    try {
        // CAMBIO: Estado inicial para 'tarjeta'
        let initialState;
        if (payment_method === 'mercadoPagoQR') {
            initialState = 'pendiente';
        } else if (payment_method === 'efectivo') {
            initialState = 'procesando_efectivo';
        } else if (payment_method === 'tarjeta') { // Nuevo estado inicial para tarjeta
            initialState = 'procesando_tarjeta'; // Puedes usar un estado específico o 'pendiente' si el flujo es manual
        } else {
            initialState = 'desconocido'; // Fallback
        }

        const { data: newOrderData, error: insertError } = await supabase
            .from('ventas')
            .insert({
                monto_total: amount,
                descripcion: finalDescription,
                estado: initialState, // Pendiente para MP, Procesando para Efectivo/Tarjeta
                metodo_pago_solicitado: payment_method,
                paciente_id: paciente_id || null,
                compra_sin_cuenta: Boolean(compra_sin_cuenta), // Asegurar booleano
                items_json: cartItems, // Guardar los items como JSON
                id_farmacia: id_farmacia, // Guardar el ID de la farmacia que hizo la venta
            })
            .select('id') // Devolver el ID de la nueva orden
            .single(); // Esperamos solo una

        if (insertError) { throw insertError; } // Lanzar si hay error de DB

        orderId = newOrderData.id;
        console.log(`   ${logPrefix} Orden ${orderId} creada en DB (Estado: ${initialState}).`);

    } catch (dbError) {
        console.error(`   ${logPrefix} FALLO Crítico al insertar venta en DB:`, dbError.message);
        return res.status(500).json({ message: `Error interno (DB): ${dbError.message}` });
    }

    // --- 2. Lógica según Método de Pago ---

    // A) Mercado Pago QR
    if (payment_method === 'mercadoPagoQR') {
        console.log(`${logPrefix} 2. Creando Preferencia MP para orden ${orderId}...`);
        const preferenceData = {
            items: [{ id: `order_${orderId}`, title: finalDescription.substring(0, 250), quantity: 1, currency_id: MP_CURRENCY_ID, unit_price: amount }],
            external_reference: orderId.toString(),
            purpose: 'wallet_purchase',
            notification_url: process.env.MP_WEBHOOK_URL,
        };
        try {
            const result = await preference.create({ body: preferenceData });
            const paymentUrl = isTestMode ? result.sandbox_init_point : result.init_point;
            const mpPreferenceId = result.id;

            if (!paymentUrl || !mpPreferenceId) throw new Error('MP no devolvió URL de pago o ID de preferencia.');
            console.log(`      ${logPrefix} Pref MP ${mpPreferenceId} creada.`);

            // 3. Actualizar orden con Pref ID (Opcional)
            console.log(`${logPrefix} 3. Actualizando orden ${orderId} con Pref ID ${mpPreferenceId}...`);
            await supabase.from('ventas').update({ mp_preferencia_id: mpPreferenceId }).eq('id', orderId);
            // No se maneja error aquí, no es crítico

            // 4. Devolver URL y OrderID al frontend
            console.log(`${logPrefix} 4. Éxito MP. Enviando URL y OrderID ${orderId}. Tiempo: ${Date.now() - start}ms`);
            return res.json({ init_point_url: paymentUrl, order_id: orderId });

        } catch (mpError) {
            console.error(`   ${logPrefix} ERROR creando Preferencia MP para orden ${orderId}:`, mpError.message, mpError.cause);
            // Marcar orden con error MP
            await supabase.from('ventas').update({ estado: 'error_mp', notas_internas: `Error MP: ${mpError.message}` }).eq('id', orderId);
            const apiStatus = mpError.cause?.apiResponse?.status || 500;
            return res.status(apiStatus).json({ message: mpError.message || 'Error al crear preferencia MP.' });
        }
    }

    // B) Efectivo O Tarjeta (se fusionan porque el flujo del backend es idéntico: confirmar y descontar stock)
    else if (payment_method === 'efectivo' || payment_method === 'tarjeta') {
        console.log(`${logPrefix} 2. Procesando Venta ${payment_method} para orden ${orderId}. Descontando stock...`);
        // Descontar stock inmediatamente
        const deductionResult = await deductStockForOrder(orderId, cartItems);

        if (deductionResult.success) {
            // Si el stock se descontó bien, marcar orden como pagada
            console.log(`   ${logPrefix} Stock descontado. Marcando orden ${orderId} como 'pagada'.`);
            try {
                const { error: updateStatusError } = await supabase.from('ventas').update({
                    estado: 'pagada',
                    metodo_pago_confirmado: payment_method, // Confirmar con el método recibido ('efectivo' o 'tarjeta')
                    last_updated_at: new Date().toISOString()
                }).eq('id', orderId);
                if (updateStatusError) throw updateStatusError; // Lanzar si falla la actualización final

                // Éxito total
                console.log(`   ${logPrefix} Orden ${orderId} completada (${payment_method}). Tiempo: ${Date.now() - start}ms`);
                return res.status(200).json({
                    message: `Venta por ${payment_method} registrada y stock descontado.`,
                    orderId: orderId,
                    receipt_number: orderId // Devolver ID como recibo
                });
            } catch (updateError) {
                console.error(`   ${logPrefix} ERROR al marcar orden ${orderId} como 'pagada':`, updateError.message);
                // La venta se hizo y el stock se descontó, pero no se pudo marcar como pagada.
                // Devolver un éxito parcial (207 Multi-Status) para indicar el problema al frontend
                 return res.status(207).json({
                     message: `Stock descontado, PERO error al actualizar estado final de la orden por ${payment_method}.`,
                     orderId: orderId,
                     receipt_number: orderId
                 });
            }
        } else {
            // Si hubo errores al descontar stock
            console.error(`   ${logPrefix} FALLO al descontar stock para orden ${orderId}:`, deductionResult.errors);
            // Marcar la orden con error de stock (ya se hace en deductStockForOrder a través de notas_internas)
            // Devolver error al frontend
            return res.status(409).json({ // 409 Conflict (problema de stock)
                 message: `No se pudo completar la venta por ${payment_method} debido a errores de stock.`,
                 orderId: orderId,
                 stockErrors: deductionResult.errors
            });
        }
    }
});


/**
 * POST /mercado_pago_webhook (Sin cambios en esta sección)
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
    // TODO: Añadir validación de X-Signature para seguridad

    let notification;
    try {
        notification = JSON.parse(req.body.toString());
        console.log(`${logPrefix} Body parseado: Type=${notification?.type}, DataID=${notification?.data?.id}`);
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
            console.log(`${logPrefix} 2. Consultando API MP...`);
            let paymentDetails;
            try {
                paymentDetails = await paymentClient.get({ id: paymentId });
                console.log(`   ${logPrefix} API MP Resp: Status=${paymentDetails?.status}, ExtRef=${paymentDetails?.external_reference}`);
            } catch (mpApiError) {
                console.error(`   ${logPrefix} Error consultando API MP para ${paymentId}:`, mpApiError.message);
                return res.sendStatus(200); // OK a MP para que no reintente este webhook
            }

            const externalReference = paymentDetails?.external_reference; // Nuestro orderId
            const paymentStatus = paymentDetails?.status; // Estado actual en MP

            if (!externalReference) {
                console.error(`   ${logPrefix} Error: No 'external_reference' en pago MP ${paymentId}.`);
                return res.sendStatus(200); // OK a MP, no podemos hacer nada
            }

            // 3. Determinar nuevo estado DB y si descontar stock
            let newDbStatus = null;
            let shouldDeductStock = false;

            if (paymentStatus === 'approved') {
                newDbStatus = 'pagada';
                shouldDeductStock = true;
            } else if (['rejected', 'cancelled', 'refunded', 'charged_back'].includes(paymentStatus)) {
                newDbStatus = 'rechazada'; // O mapear a estados más específicos
            }

            // 4. Actualizar DB si es necesario
            if (newDbStatus) {
                console.log(`${logPrefix} 3. Intentando actualizar orden ${externalReference} a '${newDbStatus}'...`);
                // Actualizar SOLO si estaba 'pendiente' para evitar doble procesamiento
                const { data: updatedOrder, error: updateError } = await supabase
                    .from('ventas')
                    .update({
                        estado: newDbStatus,
                        mp_pago_id: paymentId,
                        metodo_pago_confirmado: paymentDetails?.payment_method_id || 'mercadoPago',
                        last_updated_at: new Date().toISOString()
                    })
                    .eq('id', externalReference)
                    .eq('estado', 'pendiente') // Condición clave
                    .select('id, items_json, id_farmacia') // Necesitamos items para descontar stock
                    .single();

                if (updateError) {
                    console.error(`   ${logPrefix} ERROR DB al actualizar orden ${externalReference}:`, updateError.message);
                    // Considerar loggear esto en un sistema de monitoreo
                } else if (updatedOrder && shouldDeductStock) {
                    // Si se actualizó a 'pagada' y debemos descontar stock
                    console.log(`   ${logPrefix} Orden ${externalReference} marcada como '${newDbStatus}'. Descontando stock...`);
                    // 5. Descontar Stock
                    const deductionResult = await deductStockForOrder(externalReference, updatedOrder.items_json);
                    if (!deductionResult.success) {
                        console.error(`   ${logPrefix} FALLO al descontar stock (post-pago) para orden ${externalReference}:`, deductionResult.errors);
                        // La orden está pagada, pero el stock falló. ¡Registrar!
                    } else {
                        console.log(`   ${logPrefix} Stock descontado con éxito (post-pago) para orden ${externalReference}.`);
                    }
                } else if (!updatedOrder) {
                    console.log(`   ${logPrefix} Orden ${externalReference} no encontrada o ya no estaba 'pendiente'.`);
                } else {
                    console.log(`   ${logPrefix} Orden ${externalReference} actualizada a '${newDbStatus}'. No requiere acción de stock.`);
                }
            } else {
                console.log(`   ${logPrefix} Estado MP '${paymentStatus}' (pago ${paymentId}, orden ${externalReference}) no requiere cambio de estado en DB.`);
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
        <p>Estado MP: ${isTestMode ? 'Prueba' : 'Producción'}</p>
        <p>Supabase URL: ${supabaseUrl ? supabaseUrl.split('.')[0] + '.supabase.co' : 'No configurada'}</p>
        <p>Timestamp: ${new Date().toISOString()}</p>
    `);
});

// --- Iniciar el Servidor Express ---
app.listen(port, () => {
    console.log(`\n🚀 Servidor Node.js corriendo en http://localhost:${port}`);
    console.log(`    Modo MP: ${isTestMode ? 'Prueba (Sandbox)' : 'Producción'}`);
    console.log(`   Moneda MP: ${MP_CURRENCY_ID}`);
    if (supabase) console.log(`   Supabase Conectado: ${supabaseUrl.split('.')[0]}.supabase.co`);
    console.log(`   Webhook MP esperado en: ${process.env.MP_WEBHOOK_URL || `http://localhost:${port}/mercado_pago_webhook (¡Configura MP_WEBHOOK_URL!)`}`);
    console.log("\n------ Servidor Listo ------\n");
});


// --- Recordatorio: Función RPC 'descontar_stock' necesaria en Supabase (Sin cambios) ---
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
  FOR UPDATE; -- Bloqueo a nivel de fila

  -- Si no se encontró la combinación exacta
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Medicamento con UPC % no encontrado en la farmacia ID %.', item_upc, farmacia_id_param;
  END IF;

  -- Verificar si hay suficiente stock
  IF stock_actual < cantidad_a_descontar THEN
    -- Puedes elegir: lanzar excepción para detener todo, o solo advertir y no descontar
    RAISE WARNING 'Stock insuficiente para UPC % en farmacia ID %. Stock: %, Se necesita: %', item_upc, farmacia_id_param, stock_actual, cantidad_a_descontar;
    -- RAISE EXCEPTION 'Stock insuficiente para UPC % en farmacia ID %. Stock: %, Se necesita: %', item_upc, farmacia_id_param, stock_actual, cantidad_a_descontar;
    RETURN; -- Importante: Salir de la función si no hay stock
  END IF;

  -- Realizar el descuento si hay stock suficiente
  UPDATE medicamentos
  SET unidades = unidades - cantidad_a_descontar
  WHERE upc = item_upc AND id_farmacia = farmacia_id_param; -- Asegurar que se actualiza la correcta

  RAISE NOTICE 'Stock descontado para UPC % en farmacia ID %: % unidades.', item_upc, farmacia_id_param, cantidad_a_descontar;
END;
$$;

*/
