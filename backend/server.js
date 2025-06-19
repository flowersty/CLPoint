// backend/server.js (v5 con Tarjeta, CashSession, WorkerID + FIX LOGGING + FIX RECETAS+UPDATE MEDICAMENTOS)

require('dotenv').config();
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
    // Asegura que req.body existe y es un objeto antes de intentar Object.keys()
    if (req.body && Object.keys(req.body).length > 0 && req.path !== '/mercado_pago_webhook') {
        // Loggea todo el body excepto el binario del webhook
        console.log(`   ${logPrefix} Body:`, JSON.stringify(req.body, null, 2)); // Usar null, 2 para formato legible
    }
    req.logPrefix = logPrefix; // Añadir prefijo al objeto req para usarlo en las rutas
    next();
});


// --- Función Auxiliar para Descontar Stock (Usa RPC con id_farmacia) ---
// ... (tu función deductStockForOrder actual) ...


// --- Rutas Principales ---

/**
 * POST /create_order
 * Recibe los detalles de la venta desde el frontend.
 */
app.post('/create_order', async (req, res) => {
    const start = Date.now(); // Para medir tiempo (opcional)
    const logPrefix = req.logPrefix; // Usar el prefijo del middleware

    // Extraer todos los campos esperados del frontend
    const {
        amount, description, paciente_id, compra_sin_cuenta, cartItems, id_farmacia,
        payment_method, prescription_update_data,
        // NUEVOS CAMPOS DEL FRONTEND
        cash_session_id, id_trabajador, referencia_tarjeta
    } = req.body;

    console.log(`${logPrefix} Recibido: Method=${payment_method}, Farmacia=${id_farmacia}, Amount=${amount}, Items=${cartItems?.length}, CashSession=${cash_session_id}, Worker=${id_trabajador}, CardRef=${referencia_tarjeta}`);

    // --- Validaciones de Entrada ---
    // ... (tus validaciones actuales) ...

    const finalDescription = description || `Compra POS ${new Date().toISOString()}`;
    let orderId = null; // ID de la orden que se creará
    const saleTimestamp = new Date().toISOString(); // Marca de tiempo para la venta y el último movimiento

    // --- 1. Crear la Orden en Supabase (tabla 'ventas') ---
    console.log(`${logPrefix} 1. Creando registro en tabla 'ventas'...`);
    try {
        let initialState;
        if (payment_method === 'mercadoPagoQR') { initialState = 'pendiente'; }
        else if (payment_method === 'efectivo') { initialState = 'procesando_efectivo'; }
        else if (payment_method === 'tarjeta') { initialState = 'procesando_tarjeta'; }
        else { initialState = 'desconocido'; }

        const { data: newOrderData, error: insertError } = await supabase
            .from('ventas')
            .insert({
                monto_total: amount,
                descripcion: finalDescription,
                estado: initialState,
                metodo_pago_solicitado: payment_method,
                paciente_id: paciente_id || null,
                compra_sin_cuenta: Boolean(compra_sin_cuenta),
                items_json: cartItems, // Guardar los items como JSON
                id_farmacia: id_farmacia,
                receta_asociada_id: prescription_update_data?.receta_id || null,
                cash_session_id: cash_session_id,
                id_trabajador: id_trabajador,
                referencia_tarjeta: payment_method === 'tarjeta' ? referencia_tarjeta.trim() : null,
                // created_at, last_updated_at, fecha_pago se manejarán abajo o por DB
                fecha_pago: (payment_method !== 'mercadoPagoQR' ? saleTimestamp : null) // Registrar pago para efectivo/tarjeta inmediatamente
            })
            .select('id') // Devolver el ID de la nueva orden
            .single();

        if (insertError) { throw insertError; }

        orderId = newOrderData.id;
        console.log(`   ${logPrefix} Orden ${orderId} creada en DB (Estado: ${initialState}).`);

    } catch (dbError) {
        console.error(`   ${logPrefix} FALLO Crítico al insertar venta en DB:`, dbError.message);
        return res.status(500).json({ message: `Error interno (DB): No se pudo crear el registro de venta.`, details: dbError.message });
    }

    // --- AÑADIR LÓGICA DE ACTUALIZACIÓN DE fecha_ultimo_movimiento AQUÍ ---
    // Esta lógica se ejecuta DESPUÉS de que la venta se creó en la tabla 'ventas'
    console.log(`${logPrefix} 1.5. Actualizando fecha_ultimo_movimiento para items vendidos en orden ${orderId}...`);
    const updatedMedicineIds = new Set(); // Para no actualizar el mismo medicamento varias veces si está en el carrito

    if (cartItems && Array.isArray(cartItems)) {
         // Iterar sobre cada item en el carrito que se acaba de vender
        for (const item of cartItems) {
            // Asumimos que item.id en el cartItems del frontend es el id_farmaco
             const medicineId = item.id;
             // O si tu item_json usa id_farmaco como key: const medicineId = item.id_farmaco;

             // Validar que el item_id sea un número válido y no se haya procesado ya en este bucle
             if (typeof medicineId !== 'number' && typeof medicineId !== 'string' || updatedMedicineIds.has(medicineId)) {
                 console.warn(`   ${logPrefix} Saltando item inválido o duplicado en carrito para movimiento: ${JSON.stringify(item)}`);
                 continue; // Saltar este item
             }

            try {
                // Ejecutar el UPDATE en la tabla 'medicamentos'
                const { error: updateMovementError } = await supabase
                    .from('medicamentos')
                    .update({ fecha_ultimo_movimiento: saleTimestamp }) // Usar la marca de tiempo de la venta
                    .eq('id_farmaco', medicineId); // WHERE id_farmaco = ID del medicamento

                if (updateMovementError) {
                    console.error(`   ${logPrefix} ERROR al actualizar fecha_ultimo_movimiento para medicamento ID ${medicineId}:`, updateMovementError.message);
                     // Puedes decidir cómo manejar este error. No detendremos la venta principal por esto.
                    // Podríamos añadir una nota a la venta creada indicando este fallo específico.
                     const { data: currentOrderNotes } = await supabase.from('ventas').select('notas_internas').eq('id', orderId).single();
                     const newNotes = (currentOrderNotes?.notas_internas || '') + `; Error update mov ${medicineId}: ${updateMovementError.message}`;
                    await supabase.from('ventas').update({ notas_internas: newNotes }).eq('id', orderId);
                } else {
                    console.log(`   ${logPrefix} Actualizado fecha_ultimo_movimiento para medicamento ID ${medicineId}.`);
                    updatedMedicineIds.add(medicineId); // Marcar como procesado
                }

            } catch (movementException) {
                 console.error(`   ${logPrefix} EXCEPCIÓN al actualizar fecha_ultimo_movimiento para medicamento ID ${medicineId}:`, movementException);
                 const { data: currentOrderNotes } = await supabase.from('ventas').select('notas_internas').eq('id', orderId).single();
                 const newNotes = (currentOrderNotes?.notas_internas || '') + `; Excepción update mov ${medicineId}: ${movementException.message || 'Desconocido'}`;
                 await supabase.from('ventas').update({ notas_internas: newNotes }).eq('id', orderId);
            }
        } // Fin del bucle for over cartItems
    } else {
         console.warn(`${logPrefix} cartItems está vacío o no es un array válido. No se actualiza fecha_ultimo_movimiento.`);
    }
    // --- FIN DE LÓGICA DE ACTUALIZACIÓN DE fecha_ultimo_movimiento ---


    // --- 2. Intentar actualizar la Receta si los datos existen ---
    // ... (Tu lógica actual para actualizar receta) ...


    // --- 3. Lógica según Método de Pago ---

    // A) Mercado Pago QR
    if (payment_method === 'mercadoPagoQR') {
        console.log(`${logPrefix} 3. Creando Preferencia MP para orden ${orderId}...`);
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
            console.log(`      ${logPrefix} Pref MP ${mpPreferenceId} creada para orden ${orderId}.`);

            await supabase.from('ventas').update({ mp_preferencia_id: mpPreferenceId }).eq('id', orderId);

            console.log(`${logPrefix} 4. Éxito MP QR. Enviando URL y OrderID ${orderId}. Tiempo: ${Date.now() - start}ms`);
            return res.json({ init_point_url: paymentUrl, order_id: orderId });

        } catch (mpError) {
            console.error(`   ${logPrefix} ERROR creando Preferencia MP para orden ${orderId}:`, mpError.message, mpError.cause);
            await supabase.from('ventas').update({ estado: 'error_mp', notas_internas: `Error MP Pref: ${mpError.message}` }).eq('id', orderId);
            const apiStatus = mpError.cause?.apiResponse?.status || 500;
            return res.status(apiStatus).json({ message: mpError.message || 'Error al crear preferencia MP.' });
        }
    }

    // B) Efectivo O Tarjeta
    else if (payment_method === 'efectivo' || payment_method === 'tarjeta') {
        console.log(`${logPrefix} 3. Procesando Venta ${payment_method} para orden ${orderId}. Descontando stock...`);
        // Descontar stock inmediatamente para estos métodos
        const deductionResult = await deductStockForOrder(orderId, cartItems, logPrefix);

        // 4. Actualizar estado de la venta en 'ventas'
        if (deductionResult.success) {
            console.log(`   ${logPrefix} Stock descontado. Marcando orden ${orderId} como 'pagada'.`);
            try {
                const { error: updateStatusError } = await supabase.from('ventas').update({
                    estado: 'pagada',
                    metodo_pago_confirmado: payment_method,
                    fecha_pago: saleTimestamp, // Usar la misma marca de tiempo que para el movimiento
                }).eq('id', orderId);
                if (updateStatusError) throw updateStatusError;

                console.log(`   ${logPrefix} Orden ${orderId} completada (${payment_method}). Tiempo: ${Date.now() - start}ms`);
                return res.status(200).json({
                    message: `Venta por ${payment_method} registrada y stock descontado.`,
                    orderId: orderId,
                    receipt_number: orderId // Devolver ID como recibo
                });
            } catch (updateError) {
                console.error(`   ${logPrefix} CRÍTICO: Orden ${orderId} (${payment_method}) completada, stock descontado, PERO FALLO al marcar estado final 'pagada':`, updateError.message);
                 const { data: currentOrderNotes } = await supabase.from('ventas').select('notas_internas').eq('id', orderId).single();
                 const newNotes = (currentOrderNotes?.notas_internas || '') + `; CRÍTICO: Error final update estado: ${updateError.message}`;
                await supabase.from('ventas').update({ notas_internas: newNotes }).eq('id', orderId);
                 return res.status(200).json({
                     message: `Venta completada con ${payment_method}, pero hubo un error al registrar el estado final. Contacte a soporte.`,
                     orderId: orderId,
                     receipt_number: orderId
                 });
            }
        } else {
            console.error(`   ${logPrefix} FALLO al descontar stock para orden ${orderId} (${payment_method}):`, deductionResult.errors);
            await supabase.from('ventas').update({
                estado: 'error_stock',
                metodo_pago_confirmado: null,
                fecha_pago: null,
            }).eq('id', orderId);
            return res.status(409).json({
                 message: `No se pudo completar la venta por ${payment_method} debido a errores de stock.`,
                 orderId: orderId,
                 stockErrors: deductionResult.errors
            });
        }
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
        notification = JSON.parse(req.body.toString());
        console.log(`${logPrefix} Body parseado: Type=${notification?.type}, DataID=${notification?.data?.id}, LiveMode=${notification?.live_mode}`);
    } catch (e) {
        console.error(`${logPrefix} Error parseando cuerpo JSON:`, e.message);
        return res.sendStatus(400);
    }

    try {
        if (notification?.type === 'payment' && notification.data?.id) {
            const paymentId = notification.data.id;
            console.log(`${logPrefix} 1. Procesando Pago MP ID: ${paymentId}`);

            let paymentDetails;
            try {
                console.log(`${logPrefix} 2. Consultando API MP para pago ${paymentId}...`);
                paymentDetails = await paymentClient.get({ id: paymentId });
                console.log(`   ${logPrefix} API MP Resp para ${paymentId}: Status=${paymentDetails?.status}, ExtRef=${paymentDetails?.external_reference}, Method=${paymentDetails?.payment_method_id}`);
            } catch (mpApiError) {
                console.error(`   ${logPrefix} Error consultando API MP para ${paymentId}:`, mpApiError.message, mpApiError.cause || '');
                return res.sendStatus(200);
            }

            const externalReference = paymentDetails?.external_reference; // Nuestro orderId (STRING)
            const paymentStatus = paymentDetails?.status;
            const paidTimestamp = new Date().toISOString(); // Marca de tiempo del pago según webhook

            if (!externalReference) {
                console.error(`   ${logPrefix} Error: No 'external_reference' (orderId) en pago MP ${paymentId}.`);
                return res.sendStatus(200);
            }
            // Convertir externalReference a número si tu columna 'id' en 'ventas' es serial (number)
            const orderIdNumeric = parseInt(externalReference, 10);


            // 3. Determinar nuevo estado DB y si descontar stock
            let newDbStatus = null;
            // Para Webhook MP, solo descontamos stock si el pago se aprueba AQUÍ
            // y si el estado previo en DB era 'pendiente' o 'procesando_mp' (ver abajo el .in filter)
            let shouldDeductStockOnWebhook = false;

            if (paymentStatus === 'approved') {
                newDbStatus = 'pagada';
                // Stock se descontará si el update de estado es exitoso desde pendiente/procesando
                shouldDeductStockOnWebhook = true;
            } else if (['rejected', 'cancelled', 'refunded', 'charged_back'].includes(paymentStatus)) {
                 // Si se rechaza/cancela, debemos asegurar que el stock *no* se descuente si estaba pendiente
                 // Si ya se había descontado (ej. por error), esto no lo revertirá, necesitas lógica de devolución.
                newDbStatus = 'rechazada'; // O 'cancelada_mp', etc.
            }
            // Otros estados como 'in_process' generalmente no cambian el estado final de venta para nuestra lógica.


            // 4. Actualizar DB si es necesario
            if (newDbStatus) {
                console.log(`${logPrefix} 3. Intentando actualizar orden ${externalReference} a '${newDbStatus}' (Pago MP ${paymentId})...`);
                // Usamos el ID numérico para la consulta
                const { data: updatedOrderArray, error: updateError } = await supabase
                    .from('ventas')
                    .update({
                        estado: newDbStatus,
                        mp_pago_id: paymentId,
                        metodo_pago_confirmado: paymentDetails?.payment_method_id || 'mercadoPagoQR',
                        fecha_pago: paidTimestamp, // Usar la fecha/hora del webhook
                    })
                     // Actualizar SOLO si el estado actual en DB es 'pendiente' o 'procesando_mp'.
                     // Esto evita que un webhook tardío sobrescriba un estado de "error_stock" o similar
                    .eq('id', orderIdNumeric)
                    .in('estado', ['pendiente', 'procesando_mp'])
                    .select('id, items_json, id_farmacia, estado') // Necesitamos items_json y estado para stock
                    // .single(); // No usar single con .in
                
                if (updateError) {
                    console.error(`   ${logPrefix} ERROR DB al actualizar orden ${externalReference} (Pago MP ${paymentId}):`, updateError.message);
                } else if (updatedOrderArray && updatedOrderArray.length > 0) {
                    const updatedOrder = updatedOrderArray[0];
                    console.log(`   ${logPrefix} Orden ${externalReference} actualizada a '${updatedOrder.estado}' (Pago MP ${paymentId}).`);

                     // --- AÑADIR LÓGICA DE ACTUALIZACIÓN DE fecha_ultimo_movimiento AQUÍ PARA PAGOS MP ---
                     // Esto es necesario porque el flujo de MP es asíncrono.
                     // El movimiento se registra cuando el PAGO es CONFIRMADO (approved).
                     // Similar a la lógica en /create_order para efectivo/tarjeta.

                     if (shouldDeductStockOnWebhook && updatedOrder.estado === 'pagada') { // SOLO si la actualización resultó en estado 'pagada'
                        console.log(`${logPrefix} Procesando movimiento/stock via webhook para orden ${externalReference}.`);

                        const webhookTimestamp = new Date().toISOString(); // Marca de tiempo para el movimiento

                        const updatedMedicineIds = new Set();
                        if (updatedOrder.items_json && Array.isArray(updatedOrder.items_json)) {
                            for (const item of updatedOrder.items_json) {
                                const medicineId = item.id_farmaco; // Asegúrate que la key sea correcta en items_json
                                if (typeof medicineId !== 'number' && typeof medicineId !== 'string' || updatedMedicineIds.has(medicineId)) {
                                    console.warn(`   ${logPrefix} Saltando item inválido o duplicado en items_json MP para movimiento: ${JSON.stringify(item)}`);
                                    continue;
                                }

                                try {
                                    const { error: updateMovementError } = await supabase
                                        .from('medicamentos')
                                        .update({ fecha_ultimo_movimiento: webhookTimestamp })
                                        .eq('id_farmaco', medicineId);

                                    if (updateMovementError) {
                                        console.error(`   ${logPrefix} ERROR WH al actualizar fecha_ultimo_movimiento para med ID ${medicineId}:`, updateMovementError.message);
                                         const { data: currentOrderNotes } = await supabase.from('ventas').select('notas_internas').eq('id', orderIdNumeric).single();
                                         const newNotes = (currentOrderNotes?.notas_internas || '') + `; Error WH update mov ${medicineId}: ${updateMovementError.message}`;
                                        await supabase.from('ventas').update({ notas_internas: newNotes }).eq('id', orderIdNumeric);
                                    } else {
                                        console.log(`   ${logPrefix} WH Actualizado fecha_ultimo_movimiento para med ID ${medicineId}.`);
                                        updatedMedicineIds.add(medicineId);
                                    }

                                } catch (movementException) {
                                    console.error(`   ${logPrefix} WH EXCEPCIÓN al actualizar fecha_ultimo_movimiento para med ID ${medicineId}:`, movementException);
                                     const { data: currentOrderNotes } = await supabase.from('ventas').select('notas_internas').eq('id', orderIdNumeric).single();
                                     const newNotes = (currentOrderNotes?.notas_internas || '') + `; Excepción WH update mov ${medicineId}: ${movementException.message || 'Desconocido'}`;
                                    await supabase.from('ventas').update({ notas_internas: newNotes }).eq('id', orderIdNumeric);
                                }
                            } // Fin del bucle
                             // Opcional: Llamar a deductStockForOrder aquí si decides que el stock se descuenta SOLO en el webhook aprobado, no al crear la orden MP.
                             // PERO: tu código actual ya llama a descontar_stock al crear la orden, lo cual es más inmediato. Decidir UN SOLO lugar para descontar stock.
                        } else {
                             console.warn(`${logPrefix} items_json está vacío o no es array en orden ${externalReference} desde webhook. No se actualiza fecha_ultimo_movimiento.`);
                        }
                     } // Fin if shouldDeductStockOnWebhook

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
        res.sendStatus(200);

    } catch (webhookError) {
        console.error(`${logPrefix} ERROR CRÍTICO procesando webhook:`, webhookError.message, webhookError.stack);
        res.sendStatus(500); // Internal Server Error a MP para que reintente
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

CREATE OR REPLACE FUNCTION descontar_stock(
    item_upc text,
    cantidad_a_descontar int,
    farmacia_id_param int -- O bigint, uuid, text según tu columna id_farmacia en 'medicamentos'
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  stock_actual int;
BEGIN
  -- Bloquear la fila ESPECÍFICA de ese UPC en ESA farmacia para evitar concurrencia
  SELECT unidades INTO stock_actual
  FROM medicamentos -- Asegúrate que el nombre de tu tabla de medicamentos es correcto
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
    RAISE EXCEPTION 'Stock insuficiente para UPC ''%'' en farmacia ID ''%''. Necesario: %, Disponible: %', item_upc, farmacia_id_param, cantidad_a_descontar, stock_actual;
  END IF;

  -- Realizar el descuento si hay stock suficiente
  UPDATE medicamentos
  SET unidades = unidades - cantidad_a_descontar
  WHERE upc = item_upc AND id_farmacia = farmacia_id_param; -- Asegurar que se actualiza la fila correcta

  -- Opcional: Dejar un mensaje de aviso en los logs de Postgres (no detiene la transacción)
  -- RAISE NOTICE 'Stock descontado para UPC ''%'' en farmacia ID ''%'': % unidades. Nuevo stock: %', item_upc, farmacia_id_param, cantidad_a_descontar, stock_actual - cantidad_a_descontar;

END;
$$;
*/
