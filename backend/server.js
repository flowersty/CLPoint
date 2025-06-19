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
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !supabaseKey) {
    console.error("\n⛔ ERROR CRÍTICO: Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en backend/.env!\n");
    process.exit(1);
}
const supabase = createClient(supabaseUrl, supabaseKey);
console.log("✅ Cliente Supabase inicializado para backend.");

// --- Configuración de Mercado Pago ---
const mpAccessToken = process.env.MP_ACCESS_TOKEN;
if (!mpAccessToken) {
    console.error("\n⛔ ERROR CRÍTICO: MP_ACCESS_TOKEN no encontrado en backend/.env!\n");
    process.exit(1);
}
const isTestMode = mpAccessToken.startsWith('TEST-');
const client = new MercadoPagoConfig({ accessToken: mpAccessToken, options: { timeout: 5000 } });
const preference = new Preference(client);
const paymentClient = new Payment(client);
const MP_CURRENCY_ID = process.env.MP_CURRENCY_ID || "MXN";

// --- Middleware ---
app.use(cors());
app.use('/mercado_pago_webhook', express.raw({ type: 'application/json' }));
app.use(express.json());

app.use((req, res, next) => {
    const logPrefix = `[${req.method} ${req.path} - ${Date.now().toString().slice(-6)}]`;
    console.log(`\n➡️  ${logPrefix} Solicitud recibida.`);
    if (req.body && req.path !== '/mercado_pago_webhook') {
         try {
             if (typeof req.body === 'object' && Object.keys(req.body).length > 0) {
                console.log(`   ${logPrefix} Body:`, JSON.stringify(req.body, null, 2));
             } else if (Buffer.isBuffer(req.body)) {
                console.log(`   ${logPrefix} Body: (Buffer - ${req.body.length} bytes)`);
             }
         } catch (e) {
             console.warn(`   ${logPrefix} No se pudo loggear body como JSON o es vacío:`, e.message);
         }
    } else if (req.path === '/mercado_pago_webhook' && Buffer.isBuffer(req.body) && req.body.length > 0) {
         console.log(`   ${logPrefix} Webhook Body (raw): ${req.body.toString('utf8').substring(0, 200)}...`);
    } else if (req.body && Object.keys(req.body).length === 0) {
         console.log(`   ${logPrefix} Body: {} (Empty)`);
    }
    req.logPrefix = logPrefix;
    next();
});


// --- Función Auxiliar para Descontar Stock (Usa RPC con id_farmacia) ---
// Asegúrate que esta función esté definida ANTES de usarse en /create_order
async function deductStockByRpc(items, logPrefixParent) {
     const functionName = `[Stock Deduct RPC]`;
     const logPrefix = `${logPrefixParent} ${functionName}`;
     console.log(`${logPrefix} Iniciando deducción stock via RPC para ${items?.length || 0} tipos de items.`);
     let allSucceeded = true;
     const errors = [];
     const deductionMap = new Map();

     if (items && Array.isArray(items)) {
        for (const item of items) {
             // Validar item antes de agregarlo al mapa
             // ¡IMPORTANTE! Ahora validamos que el item tenga UPC y id_farmacia
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
         const farmacia_id = parseInt(farmacia_id_str, 10);

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
    const processedItemsKeys = new Set(); // Usar UPC|Farmacia para evitar duplicados

    if (!items || !Array.isArray(items) || items.length === 0) {
        console.log(`${logPrefix} No hay items en la lista. Omitiendo actualización de movimiento.`);
        return { successCount: 0, errors: [] };
    }

    const errors = [];
    let successCount = 0;

    for (const item of items) {
         // **CAMBIO CRÍTICO AQUÍ**: Extraemos UPC y id_farmacia del item.
         // Asumimos que el item tiene 'upc' y 'id_farmacia'.
         const itemUpc = item.upc;
         const itemFarmaciaId = item.id_farmacia;
         const itemQuantity = item.cantidad; // Podemos usar la cantidad en el log si queremos

         const itemKey = `${itemUpc}|${itemFarmaciaId}`;

         // Validar datos esenciales del item y evitar duplicados
         if (!itemUpc || itemFarmaciaId === undefined || itemFarmaciaId === null || typeof itemFarmaciaId !== 'number' || processedItemsKeys.has(itemKey)) {
              console.warn(`   ${logPrefix} Saltando item inválido (falta UPC/Farmacia ID o ID inválido) o duplicado: ${JSON.stringify(item)}`);
              continue; // Saltar este item
         }

        try {
            // **CAMBIO CRÍTICO AQUÍ**: BUSCAMOS EL id_farmaco USANDO upc y id_farmacia
            console.log(`   ${logPrefix} Buscando id_farmaco para UPC '${itemUpc}' en Farmacia '${itemFarmaciaId}'...`);
            const { data: medicineData, error: fetchError } = await supabase
                 .from('medicamentos')
                 .select('id_farmaco') // Solo necesitamos el ID
                 .eq('upc', itemUpc)
                 .eq('id_farmacia', itemFarmaciaId) // Filtrar por farmacia
                 .single();

            if (fetchError || !medicineData) {
                // Esto ocurre si el medicamento no existe con ese UPC en esa farmacia
                 console.warn(`   ${logPrefix} Medicamento no encontrado por UPC '${itemUpc}' en Farmacia '${itemFarmaciaId}'. No se puede actualizar fecha_ultimo_movimiento.`);
                 errors.push(`Medicamento no encontrado (UPC: ${itemUpc}, Farmacia: ${itemFarmaciaId})`);
                 continue; // Saltar la actualización para este item
            }

            const medicineId = medicineData.id_farmaco; // Obtener el id_farmaco real

            // Ejecutar el UPDATE en la tabla 'medicamentos' usando el id_farmaco encontrado
            console.log(`   ${logPrefix} Actualizando fecha_ultimo_movimiento para medicamento ID ${medicineId} (UPC ${itemUpc}) a ${timestamp}...`);
            const { error: updateError, count } = await supabase
                .from('medicamentos')
                .update({ fecha_ultimo_movimiento: timestamp })
                .eq('id_farmaco', medicineId); // Usar el id_farmaco real

            if (updateError) {
                console.error(`   ${logPrefix} ERROR Supabase al actualizar fecha_ultimo_movimiento para med ID ${medicineId} (UPC ${itemUpc}):`, updateError.message);
                errors.push(`Error update movimiento para med ID ${medicineId} (UPC ${itemUpc}): ${updateError.message}`);
            } else if (count === 0) {
                 // Esto no debería pasar si fetchData encontró algo, pero es una buena verificación
                 console.warn(`   ${logPrefix} Actualización de fecha_ultimo_movimiento no afectó filas para med ID ${medicineId} (UPC ${itemUpc}) después de encontrarlo.`);
                 errors.push(`Actualización no aplicada para med ID ${medicineId} (UPC ${itemUpc}).`);
            } else {
                console.log(`   ${logPrefix} Éxito al actualizar fecha_ultimo_movimiento para medicamento ID ${medicineId} (UPC ${itemUpc}).`);
                processedItemsKeys.add(itemKey); // Marcar como procesado y exitoso usando la key única
                successCount++;
            }

        } catch (updateException) {
             console.error(`   ${logPrefix} EXCEPCIÓN al procesar item para movimiento (UPC ${itemUpc}, Farm ${itemFarmaciaId}):`, updateException);
             errors.push(`Excepción update movimiento para item (UPC ${itemUpc}, Farmacia ${itemFarmaciaId}): ${updateException.message || 'Desconocido'}`);
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
    let orderId = null;

    // --- AÑADIR TRY...CATCH EXTERNO PARA CAPTURAR CUALQUIER ERROR NO CAPTURADO ANTES ---
    try {
        const {
            amount, description, paciente_id, compra_sin_cuenta, cartItems, id_farmacia,
            payment_method, prescription_update_data,
            cash_session_id, id_trabajador, referencia_tarjeta
        } = req.body;

        console.log(`${logPrefix} Recibido: Method=${payment_method}, Farmacia=${id_farmacia}, Amount=${amount}, Items=${cartItems?.length}, CashSession=${cash_session_id}, Worker=${id_trabajador}, CardRef=${referencia_tarjeta}`);

        // --- Validaciones de Entrada (Síncronas) ---
        if (!amount || typeof amount !== 'number' || amount <= 0) { console.warn(`${logPrefix} Rechazado (400): Monto inválido.`); return res.status(400).json({ message: 'Monto inválido.' }); }
        if (!payment_method || !['efectivo', 'mercadoPagoQR', 'tarjeta'].includes(payment_method)) { console.warn(`${logPrefix} Rechazado (400): Método de pago '${payment_method}' inválido.`); return res.status(400).json({ message: 'Método de pago inválido o faltante.' }); }
        if (id_farmacia === undefined || id_farmacia === null || (typeof id_farmacia !== 'number' && typeof id_farmacia !== 'string')) { console.warn(`${logPrefix} Rechazado (400): Falta o ID de farmacia inválido.`); return res.status(400).json({ message: 'Falta ID de farmacia.' }); }
        if (!cartItems || !Array.isArray(cartItems) || cartItems.length === 0) { console.warn(`${logPrefix} Rechazado (400): Carrito vacío o inválido.`); return res.status(400).json({ message: 'El carrito está vacío o es inválido.' }); }
         // Validar que CADA item en cartItems tenga AL MENOS upc y id_farmacia
        if (!cartItems.every(item => item.upc && (item.id_farmacia !== undefined && item.id_farmacia !== null))) {
             console.warn(`${logPrefix} Rechazado (400): Falta UPC o ID de farmacia en al menos un item del carrito.`);
             return res.status(400).json({ message: 'Error interno: Falta UPC o ID de farmacia en los items del carrito.' });
        }
         // Opcional: Validar consistencia de id_farmacia entre cartItems y el id_farmacia de la venta
        // if (!cartItems.every(item => item.id_farmacia == id_farmacia)) { console.warn(`${logPrefix} Rechazado (400): Inconsistencia o falta de ID de farmacia en los items del carrito.`); return res.status(400).json({ message: 'Error interno: Inconsistencia o faltan datos de farmacia en los items del carrito.' }); }

        if (!cash_session_id) { console.warn(`${logPrefix} Rechazado (400): Falta ID de sesión de caja.`); return res.status(400).json({ message: 'Falta ID de sesión de caja. Por favor, abre la caja primero.' }); }
        if (!id_trabajador) { console.warn(`${logPrefix} Rechazado (400): Falta ID de trabajador.`); return res.status(400).json({ message: 'Falta ID de trabajador.' }); }
        if (payment_method === 'tarjeta' && (!referencia_tarjeta || typeof referencia_tarjeta !== 'string' || referencia_tarjeta.trim() === '')) { console.warn(`${logPrefix} Rechazado (400): Falta referencia de tarjeta.`); return res.status(400).json({ message: 'Falta referencia de tarjeta para pago con tarjeta.' }); }


        const finalDescription = description || `Venta POS ${new Date().toISOString().slice(-10)}`;
        const saleTimestamp = new Date().toISOString();

        // --- 1. Crear la Orden en Supabase (tabla 'ventas') ---
        console.log(`${logPrefix} 1. Creando registro en tabla 'ventas'...`);
        let initialState;
        if (payment_method === 'mercadoPagoQR') { initialState = 'pendiente'; }
        else if (payment_method === 'efectivo') { initialState = 'procesando_efectivo'; }
        else if (payment_method === 'tarjeta') { initialState = 'procesando_tarjeta'; }
        else { initialState = 'desconocido'; }

        const { data: newOrderData, error: insertError } = await supabase
            .from('ventas')
            .insert({
                monto_total: amount,
                descripcion: finalDescription.substring(0, 255),
                estado: initialState,
                metodo_pago_solicitado: payment_method,
                paciente_id: paciente_id || null,
                compra_sin_cuenta: Boolean(compra_sin_cuenta),
                items_json: cartItems,
                id_farmacia: id_farmacia,
                receta_asociada_id: prescription_update_data?.receta_id || null,
                cash_session_id: cash_session_id,
                id_trabajador: id_trabajador,
                referencia_tarjeta: payment_method === 'tarjeta' ? referencia_tarjeta.trim() : null,
                fecha_pago: (payment_method !== 'mercadoPagoQR' ? saleTimestamp : null)
            })
            .select('id')
            .single();

        if (insertError) { throw insertError; }

        orderId = newOrderData.id;
        console.log(`   ${logPrefix} Orden ${orderId} creada en DB (Estado: ${initialState}).`);


        // --- 1.5. Actualizar fecha_ultimo_movimiento para items vendidos ---
        // Esto se hace AHORA después de que la venta está en la DB (para efectivo/tarjeta)
        // Para MP, se hace cuando llega el webhook aprobado
        if (payment_method !== 'mercadoPagoQR') { // Solo para métodos síncronos
             const movementUpdateResult = await updateLastMovement(cartItems, saleTimestamp, logPrefix);
             if (movementUpdateResult.errors.length > 0) {
                  console.error(`${logPrefix} Fallos al actualizar fecha_ultimo_movimiento para orden ${orderId}:`, movementUpdateResult.errors);
                  const { data: currentOrderNotes } = await supabase.from('ventas').select('notas_internas').eq('id', orderId).single();
                  const newNotes = (currentOrderNotes?.notas_internas || '') + `; Errores mov: ${movementUpdateResult.errors.join('; ')}`;
                 await supabase.from('ventas').update({ notas_internas: newNotes }).eq('id', orderId);
             } else {
                  console.log(`${logPrefix} Actualización fecha_ultimo_movimiento completada para orden ${orderId}. Éxitos: ${movementUpdateResult.successCount}`);
             }
        }


        // --- 2. Intentar actualizar la Receta si los datos existen ---
        if (prescription_update_data && prescription_update_data.receta_id) {
            console.log(`${logPrefix} 2. Intentando actualizar Receta ID: ${prescription_update_data.receta_id}...`);
            try {
                const { data: updatedRecetaArray, error: updateRecetaError } = await supabase
                    .from('recetas')
                    .update({
                        estado_dispensacion: prescription_update_data.estado_dispensacion,
                        medicamentos_dispensados_detalle: prescription_update_data.medicamentos_dispensados_detalle,
                        fecha_dispensacion: new Date().toISOString()
                    })
                    .eq('id', prescription_update_data.receta_id)
                    .select('id, estado_dispensacion');

                if (updateRecetaError) {
                    console.error(`   ${logPrefix} ERROR al actualizar Receta ${prescription_update_data.receta_id}:`, updateRecetaError.message);
                     const { data: currentOrderNotes } = await supabase.from('ventas').select('notas_internas').eq('id', orderId).single();
                     const newNotes = (currentOrderNotes?.notas_internas || '') + `; Error update receta: ${updateRecetaError.message}`;
                    await supabase.from('ventas').update({ notas_internas: newNotes }).eq('id', orderId);
                } else if (!updatedRecetaArray || updatedRecetaArray.length === 0) {
                     console.warn(`   ${logPrefix} UPDATE de Receta ${prescription_update_data.receta_id} no afectó filas.`);
                     const { data: currentOrderNotes } = await supabase.from('ventas').select('notas_internas').eq('id', orderId).single();
                     const newNotes = (currentOrderNotes?.notas_internas || '') + `; Warn update receta: no afectó filas`;
                    await supabase.from('ventas').update({ notas_internas: newNotes }).eq('id', orderId);
                } else {
                    console.log(`   ${logPrefix} Receta ${prescription_update_data.receta_id} actualizada a estado: ${updatedRecetaArray[0].estado_dispensacion}.`);
                }
            } catch (recetaUpdateException) {
                 console.error(`   ${logPrefix} EXCEPCIÓN al actualizar Receta ${prescription_update_data.receta_id}:`, recetaUpdateException);
                 const { data: currentOrderNotes } = await supabase.from('ventas').select('notas_internas').eq('id', orderId).single();
                 const newNotes = (currentOrderNotes?.notas_internas || '') + `; Excepción update receta: ${recetaUpdateException.message || 'Desconocido'}`;
                 await supabase.from('ventas').update({ notas_internas: newNotes }).eq('id', orderId);
            }
        } else {
            console.log(`${logPrefix} No se recibió prescription_update_data válido. Omitiendo actualización de receta.`);
        }


        // --- 3. Lógica según Método de Pago ---

        // A) Mercado Pago QR (asíncrono)
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
                // Si falla la creación de la preferencia MP, marcamos la venta con error MP.
                // El movimiento ya fue actualizado en el paso 1.5 para TODOS los métodos.
                await supabase.from('ventas').update({ estado: 'error_mp', notas_internas: `Error MP Pref: ${mpError.message}` }).eq('id', orderId);
                throw mpError; // Relanzar para que el catch externo la maneje.
            }
        }

        // B) Efectivo O Tarjeta (síncrono)
        else if (payment_method === 'efectivo' || payment_method === 'tarjeta') {
            console.log(`${logPrefix} 3. Procesando Venta ${payment_method} para orden ${orderId}. Descontando stock...`);
            // Descontar stock inmediatamente
            const deductionResult = await deductStockByRpc(cartItems, logPrefix);

            // 4. Actualizar estado final de la venta
            if (deductionResult.success) {
                console.log(`   ${logPrefix} Stock descontado. Marcando orden ${orderId} como 'pagada'.`);
                try {
                    const { error: updateStatusError } = await supabase.from('ventas').update({
                        estado: 'pagada',
                        metodo_pago_confirmado: payment_method,
                        // fecha_pago ya se estableció en el paso 1 con saleTimestamp
                    }).eq('id', orderId);
                    if (updateStatusError) throw updateStatusError;

                    // Éxito total para efectivo/tarjeta
                    console.log(`   ${logPrefix} Orden ${orderId} completada (${payment_method}). Tiempo: ${Date.now() - start}ms`);
                    return res.status(200).json({
                        message: `Venta por ${payment_method} registrada y stock descontado.`,
                        orderId: orderId,
                        receipt_number: orderId
                    });
                } catch (updateError) {
                    console.error(`   ${logPrefix} CRÍTICO: Orden ${orderId} (${payment_method}) completada, stock descontado, PERO FALLO al marcar estado final 'pagada':`, updateError.message);
                     const { data: currentOrderNotes } = await supabase.from('ventas').select('notas_internas').eq('id', orderId).single();
                     const newNotes = (currentOrderNotes?.notas_internas || '') + `; CRÍTICO: Error final update estado: ${updateError.message}`;
                    await supabase.from('ventas').update({ notas_internas: newNotes }).eq('id', orderId);
                     return res.status(200).json({
                         message: `Venta completada con ${payment_method}, pero hubo un error menor al registrar el estado final. Contacte a soporte.`,
                         orderId: orderId,
                         receipt_number: orderId
                     });
                }
            } else {
                console.error(`   ${logPrefix} FALLO al descontar stock para orden ${orderId} (${payment_method}):`, deductionResult.errors);
                // La venta ya se creó, la marcamos con error de stock
                 await supabase.from('ventas').update({
                     estado: 'error_stock',
                     metodo_pago_confirmado: null,
                     fecha_pago: null,
                     notas_internas: `FALLO STOCK: ${deductionResult.errors.join('; ')}`
                 }).eq('id', orderId);
                 // Lanzar error para que el catch externo lo maneje y devuelva 409
                 const stockErrorMessage = `No se pudo completar la venta por ${payment_method} debido a errores de stock. Detalles: ${deductionResult.errors.join('; ')}`;
                 throw new Error(stockErrorMessage);
            }
        } else {
             console.warn(`${logPrefix} Método de pago desconocido o faltante: ${payment_method}`);
             throw new Error(`Método de pago desconocido.`);
        }

    } catch (generalError) {
        console.error(`${logPrefix} ERROR NO CAPTURADO en /create_order:`, generalError.message, generalError);
        if (orderId) {
            try {
                 const { data: currentOrderNotes } = await supabase.from('ventas').select('notas_internas').eq('id', orderId).single();
                 const newNotes = (currentOrderNotes?.notas_internas || '') + `; Error ruta /create_order: ${generalError.message || 'Desconocido'}`;

                let errorState = 'error_backend';
                 if (generalError.message.includes('Stock insuficiente') || generalError.message.includes('Error de stock')) {
                     errorState = 'error_stock';
                 } else if (generalError.message.includes('Error MP Pref')) {
                     errorState = 'error_mp';
                 }

                await supabase.from('ventas')
                    .update({
                         estado: errorState,
                         notas_internas: newNotes,
                         metodo_pago_confirmado: null,
                         fecha_pago: null,
                    })
                    .eq('id', orderId)
                    .in('estado', ['pendiente', 'procesando_efectivo', 'procesando_tarjeta', 'error_mp', 'error_stock', 'pagada_stock_fallido']); // Incluir más estados si es necesario

            } catch (updateError) {
                console.error(`${logPrefix} CRÍTICO: FALLO ADICIONAL al registrar error en orden ${orderId}:`, updateError.message);
            }
        }
        const statusCode = (generalError.message.includes('Stock insuficiente') || generalError.message.includes('Error de stock')) ? 409 : 500;

        return res.status(statusCode).json({
            message: `Error procesando la venta: ${generalError.message}`,
            orderId: orderId,
            ...(statusCode === 409 && generalError.message.includes('Detalles:') && { stockErrors: generalError.message.split('Detalles:')[1]?.split(';').map(e => e.trim()) }) // Parsed errors
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
        notification = JSON.parse(req.body.toString('utf8'));
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
                 return res.sendStatus(200); // Send OK to MP to avoid retries on our API query failure
            }

            const externalReference = paymentDetails?.external_reference; // Nuestro orderId (STRING)
            const paymentStatus = paymentDetails?.status;
            const paidTimestamp = new Date().toISOString(); // Timestamp when webhook is processed

            if (!externalReference) {
                console.error(`   ${logPrefix} Error: No 'external_reference' (orderId) en pago MP ${paymentId}.`);
                return res.sendStatus(200);
            }
            const orderIdNumeric = parseInt(externalReference, 10);
             if (isNaN(orderIdNumeric)) {
                  console.error(`   ${logPrefix} Error: external_reference '${externalReference}' de MP no es un número válido.`);
                  return res.sendStatus(200);
             }

            let newDbStatus = null;

            if (paymentStatus === 'approved') {
                newDbStatus = 'pagada';
            } else if (['rejected', 'cancelled', 'refunded', 'charged_back'].includes(paymentStatus)) {
                newDbStatus = 'rechazada';
            }

            if (newDbStatus) {
                console.log(`${logPrefix} 3. Intentando actualizar orden ${externalReference} a '${newDbStatus}' (Pago MP ${paymentId})...`);
                // SELECT antes de UPDATE para obtener items_json si vamos a actualizar movimiento
                 const { data: orderBeforeUpdate, error: fetchOrderError } = await supabase
                      .from('ventas')
                      .select('id, estado, items_json')
                      .eq('id', orderIdNumeric)
                      .single();

                 if (fetchOrderError || !orderBeforeUpdate) {
                     console.error(`   ${logPrefix} ERROR DB o no encontrada orden ${externalReference} para actualizar via webhook:`, fetchOrderError?.message);
                     return res.sendStatus(200); // OK to MP, we can't process
                 }

                 // Solo actualizar si el estado actual permite la transición
                 const currentState = orderBeforeUpdate.estado;
                 const allowedStatesForUpdate = ['pendiente', 'procesando_mp']; // Add 'error_mp' if webhook should fix MP errors

                 if (!allowedStatesForUpdate.includes(currentState)) {
                      console.warn(`   ${logPrefix} Orden ${externalReference} en estado '${currentState}'. No se actualiza a '${newDbStatus}' via webhook.`);
                      return res.sendStatus(200); // OK to MP, state is not relevant
                 }

                // Proceed with UPDATE
                const { data: updatedOrderArray, error: updateError } = await supabase
                    .from('ventas')
                    .update({
                        estado: newDbStatus,
                        mp_pago_id: paymentId,
                        metodo_pago_confirmado: paymentDetails?.payment_method_id || 'mercadoPagoQR',
                        fecha_pago: paidTimestamp, // Use the webhook timestamp
                    })
                    .eq('id', orderIdNumeric)
                    // No need for .in filter on state here because we checked it with the select
                    .select('id, items_json, id_farmacia, estado'); // Select again for verification

                if (updateError) {
                    console.error(`   ${logPrefix} ERROR DB al actualizar orden ${externalReference} (Pago MP ${paymentId}):`, updateError.message);
                } else if (updatedOrderArray && updatedOrderArray.length > 0) {
                    const updatedOrder = updatedOrderArray[0];
                    console.log(`   ${logPrefix} Orden ${externalReference} actualizada a '${updatedOrder.estado}' (Pago MP ${paymentId}).`);

                     // --- LÓGICA DE ACTUALIZACIÓN DE fecha_ultimo_movimiento PARA PAGOS MP APROBADOS ---
                     // Solo si la actualización resultó en estado 'pagada'
                     if (updatedOrder.estado === 'pagada') {
                        console.log(`${logPrefix} Procesando movimiento via webhook para orden ${externalReference}.`);

                        // Usamos el items_json de la ORDEN recuperada/actualizada
                        const movementUpdateResult = await updateLastMovement(updatedOrder.items_json, paidTimestamp, logPrefix); // Pass fetched items_json
                        if (movementUpdateResult.errors.length > 0) {
                             console.error(`   ${logPrefix} FALLO al actualizar fecha_ultimo_movimiento (Webhook MP) para orden ${externalReference}:`, movementUpdateResult.errors);
                             const { data: currentOrderNotes } = await supabase.from('ventas').select('notas_internas').eq('id', orderIdNumeric).single();
                             const newNotes = (currentOrderNotes?.notas_internas || '') + `; Errores mov WH: ${movementUpdateResult.errors.join('; ')}`;
                             await supabase.from('ventas').update({ notas_internas: newNotes }).eq('id', orderIdNumeric);
                        } else {
                             console.log(`   ${logPrefix} Fecha_ultimo_movimiento actualizada con éxito (Webhook MP) para orden ${externalReference}.`);
                        }
                     }

                } else {
                     console.warn(`   ${logPrefix} Orden ${externalReference} no encontrada o ya procesada. No se actualizó estado via webhook.`);
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
