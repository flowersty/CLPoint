// backend/server.js (COMPLETO Y FINAL - JS Puro con Supabase y Descuento Stock)

require('dotenv').config(); // Carga variables de ./backend/.env
const express = require('express');
const { MercadoPagoConfig, Preference, Payment } = require('mercadopago');
const path = require('path');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const port = process.env.PORT || 3000;

// --- Configuración de Supabase (Backend) ---
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY; // Clave secreta!
if (!supabaseUrl || !supabaseKey) {
    console.error("ERROR CRÍTICO: Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en backend/.env!");
    process.exit(1);
}
const supabase = createClient(supabaseUrl, supabaseKey);
console.log("Cliente Supabase inicializado (para backend).");

// --- Configuración de Mercado Pago ---
const mpAccessToken = process.env.MP_ACCESS_TOKEN;
if (!mpAccessToken) {
    console.error("ERROR CRÍTICO: MP_ACCESS_TOKEN no encontrado en backend/.env!");
    process.exit(1);
}
const isTestMode = mpAccessToken.startsWith('TEST-');
const client = new MercadoPagoConfig({ accessToken: mpAccessToken, options: { timeout: 5000 } });
const preference = new Preference(client);
const paymentClient = new Payment(client);
const MP_CURRENCY_ID = process.env.MP_CURRENCY_ID || "MXN"; // Ajusta default si es necesario

// --- Middleware ---
app.use(cors()); // Habilitar CORS
app.use('/mercado_pago_webhook', express.raw({ type: 'application/json' })); // Webhook como raw
app.use(express.json()); // Resto como JSON

// --- Función Auxiliar para Descontar Stock (Usa RPC) ---
async function deductStockForOrder(orderId, items) {
    if (!supabase || !items || !Array.isArray(items) || items.length === 0) {
        console.warn(`[Stock Deduct ${orderId}] Supabase no disponible o items inválidos/vacíos.`);
        return { success: false, error: "Configuración o datos inválidos." };
    }
    console.log(`[Stock Deduct ${orderId}] Iniciando deducción para ${items.length} tipos de items.`);
    let allSucceeded = true;
    const errors = [];

    for (const item of items) {
        const { upc, cantidad } = item;
        if (!upc || !cantidad || cantidad <= 0) {
            console.warn(`[Stock Deduct ${orderId}] Item inválido omitido:`, item);
            continue;
        }
        try {
            // Llamar a la función RPC creada en Supabase
            const { error: rpcError } = await supabase.rpc('descontar_stock', {
                 item_upc: upc,
                 cantidad_a_descontar: cantidad
            });
            if (rpcError) throw rpcError; // Si la función RPC lanza una excepción
            console.log(`   [Stock Deduct ${orderId}] Éxito descontando ${cantidad} de UPC ${upc} via RPC.`);
        } catch (error) {
            console.error(`   [Stock Deduct ${orderId}] ERROR RPC descontando ${cantidad} de UPC ${upc}:`, error.message || error);
            allSucceeded = false;
            errors.push(`Error en UPC ${upc}: ${error.message}`);
        }
    }

    // Actualizar notas internas en la venta sobre el resultado del stock
    const notePrefix = allSucceeded ? 'Stock descontado' : `Error al descontar stock: ${errors.join('; ')}`;
    try {
        await supabase.from('ventas').update({ notas_internas: `${notePrefix} - ${new Date().toISOString()}` }).eq('id', orderId);
    } catch (e) { console.error(`Error actualizando notas_internas para orden ${orderId}:`, e); }

    return { success: allSucceeded, errors: errors };
}


// --- Rutas ---

// POST /create_order: Crear orden en DB y preferencia en MP
app.post('/create_order', async (req, res) => {
    const { amount, description, paciente_id, compra_sin_cuenta, cartItems } = req.body;
    if (!amount || typeof amount !== 'number' || amount <= 0) return res.status(400).json({ message: 'Monto inválido.' });
    const finalDescription = description || `Compra POS ${new Date().toISOString()}`;
    let orderId = null;

    // 1. Crear Orden en Supabase
    console.log("1. Creando orden en Supabase...");
    try {
        const { data: newOrderData, error: insertError } = await supabase.from('ventas').insert({
            monto_total: amount, descripcion: finalDescription, estado: 'pendiente',
            metodo_pago_solicitado: 'mercadoPagoQR', paciente_id: paciente_id || null,
            compra_sin_cuenta: compra_sin_cuenta || !paciente_id, items_json: cartItems || [],
        }).select('id').single();
        if (insertError) throw insertError;
        orderId = newOrderData.id;
        console.log(`   Orden ${orderId} creada.`);
    } catch (dbError) { console.error("   ERROR DB:", dbError.message); return res.status(500).json({ message: 'Error interno (DB).' }); }

    // 2. Crear Preferencia MP
    const preferenceData = {
        items: [{ id: `order_${orderId}`, title: finalDescription.substring(0, 250), description: `Ref Orden: ${orderId}`, quantity: 1, currency_id: MP_CURRENCY_ID, unit_price: amount }],
        external_reference: orderId.toString(), purpose: 'wallet_purchase',
        notification_url: process.env.MP_WEBHOOK_URL, // Leer de .env
    };
    try {
        console.log(`2. Creando Preferencia MP para orden: ${orderId}`);
        const result = await preference.create({ body: preferenceData });
        let paymentUrl = null; let mpPreferenceId = result.id || null;
        if (isTestMode && result.sandbox_init_point) paymentUrl = result.sandbox_init_point;
        else if (result.init_point) paymentUrl = result.init_point;
        else throw new Error('MP no devolvió URL de pago.');
        console.log(`   Preferencia MP ${mpPreferenceId} creada.`);

        // 3. Actualizar Orden con Pref ID (Opcional)
        if (orderId && mpPreferenceId) {
             console.log(`3. Actualizando orden ${orderId} con MP Pref ID: ${mpPreferenceId}`);
             const { error: updateError } = await supabase.from('ventas').update({ mp_preferencia_id: mpPreferenceId }).eq('id', orderId);
             if(updateError) console.error(`   Error actualizando Pref ID:`, updateError.message);
        }

        // 4. Devolver URL y OrderID
        console.log(`4. Enviando URL y OrderID ${orderId} al frontend.`);
        res.json({ init_point_url: paymentUrl, order_id: orderId });

    } catch (mpError) {
         console.error(`   ERROR MP orden ${orderId}:`, mpError.message);
         // Marcar orden con error si falló MP
         if(orderId) { try { await supabase.from('ventas').update({ estado: 'error_mp' }).eq('id', orderId); } catch(e){console.error("Error marcando error_mp",e)} }
         const apiStatus = mpError.cause?.apiResponse?.status || 500;
         res.status(apiStatus).json({ message: mpError.message || 'Error al crear pago MP.' });
    }
});

// POST /confirm_cash_sale/:orderId: Confirmar venta efectivo y descontar stock
app.post('/confirm_cash_sale/:orderId', async (req, res) => {
    const orderId = req.params.orderId;
    console.log(`\n[Cash Sale ${orderId}] Confirmación recibida.`);
    if (!supabase) return res.status(500).json({ message: "Error interno (DB)." });
    if (!orderId) return res.status(400).json({ message: "Falta ID de orden." });

    try {
        // 1. Obtener items y verificar estado
        console.log(`   1. Obteniendo orden ${orderId}...`);
        const { data: orderData, error: fetchError } = await supabase
            .from('ventas').select('id, estado, items_json').eq('id', orderId).single();
        if (fetchError) throw new Error(`Error obteniendo orden: ${fetchError.message}`);
        if (!orderData) throw new Error(`Orden ${orderId} no encontrada.`);
        if (orderData.estado !== 'pendiente') {
            console.warn(`   Orden ${orderId} ya está '${orderData.estado}'.`);
            return res.status(200).json({ message: "Orden ya procesada.", orderStatus: orderData.estado });
        }

        // 2. Marcar como Pagada (Efectivo)
        console.log(`   2. Marcando orden ${orderId} como 'pagada'...`);
        const { error: updateError } = await supabase.from('ventas').update({
            estado: 'pagada', metodo_pago_confirmado: 'efectivo', last_updated_at: new Date().toISOString()
        }).eq('id', orderId);
        if (updateError) throw new Error(`Error actualizando a 'pagada': ${updateError.message}`);
        console.log(`   Orden ${orderId} marcada como 'pagada'.`);

        // 3. Descontar Stock
        console.log(`   3. Descontando stock para orden ${orderId}...`);
        const deductionResult = await deductStockForOrder(orderId, orderData.items_json);

        if (deductionResult.success) {
            console.log(`   [Cash Sale ${orderId}] Éxito.`);
            res.status(200).json({ message: "Venta confirmada y stock descontado.", orderId: orderId });
        } else {
            console.error(`   [Cash Sale ${orderId}] Errores de stock:`, deductionResult.errors);
            res.status(207).json({ message: "Venta confirmada, PERO con errores de stock.", orderId: orderId, stockErrors: deductionResult.errors });
        }
    } catch (error) {
        console.error(`[Cash Sale ${orderId}] ERROR:`, error.message);
        res.status(500).json({ message: error.message || "Error interno." });
    }
});

// POST /mercado_pago_webhook: Recibir notificaciones de MP
app.post('/mercado_pago_webhook', async (req, res) => {
    console.log("\n------ Webhook MP Recibido ------");
    // TODO: Validar firma X-Signature aquí
    let notification;
    try { notification = JSON.parse(req.body.toString()); } catch (e) { return res.sendStatus(400); }
    console.log("Tipo:", notification?.type, "| Data ID:", notification?.data?.id);

    try {
        if (notification?.type === 'payment' && notification.data?.id) {
            const paymentId = notification.data.id;
            console.log(`1. Procesando Pago ID: ${paymentId}`);

            // 2. Consultar API MP (¡FUNDAMENTAL!)
            console.log(`2. Consultando API MP...`);
            let paymentDetails;
            try { paymentDetails = await paymentClient.get({ id: paymentId }); }
            catch (mpApiError) { console.error("   Error API MP", mpApiError.message); return res.sendStatus(200); } // OK a MP aunque falle consulta

            const externalReference = paymentDetails?.external_reference;
            const paymentStatus = paymentDetails?.status;
            console.log(`   Status MP: ${paymentStatus}, ExternalRef: ${externalReference}`);

            if (!externalReference) { console.error(`   No external_reference en API MP para ${paymentId}.`); return res.sendStatus(200); }

            // 3. Mapear estado y actualizar DB
            let newDbStatus = null;
            if (paymentStatus === 'approved') newDbStatus = 'pagada';
            else if (['rejected', 'cancelled', 'refunded', 'charged_back'].includes(paymentStatus)) newDbStatus = 'rechazada';

            if (newDbStatus) {
                console.log(`3. Actualizando orden ${externalReference} a '${newDbStatus}'...`);
                const { data: updatedOrder, error: updateError } = await supabase
                    .from('ventas')
                    .update({ estado: newDbStatus, mp_pago_id: paymentId, metodo_pago_confirmado: paymentDetails?.payment_method_id || 'mercadoPago', last_updated_at: new Date().toISOString() })
                    .eq('id', externalReference)
                    .eq('estado', 'pendiente') // Solo si aún estaba pendiente
                    .select('id, items_json') // Devolver para descontar stock
                    .single();

                if (updateError) { console.error(`   ERROR DB Update:`, updateError.message); }
                else if (updatedOrder && newDbStatus === 'pagada') { // Solo descontar si se actualizó a pagada
                     console.log(`   Orden ${externalReference} actualizada. Descontando stock...`);
                     // 4. Descontar Stock
                     await deductStockForOrder(externalReference, updatedOrder.items_json);
                } else if (!updatedOrder) { console.log(`   Orden ${externalReference} no estaba pendiente o no encontrada.`); }
            } else { console.log(`   Estado MP '${paymentStatus}' no requiere acción DB.`); }
        } else { console.log(`   Webhook tipo '${notification?.type}' ignorado.`); }
        res.sendStatus(200); // OK a MP
    } catch (webhookError) { console.error("ERROR procesando webhook:", webhookError.message); res.sendStatus(500); }
});

// --- Iniciar Servidor ---
app.listen(port, () => {
    console.log(`\nServidor Node.js corriendo en http://localhost:${port}`);
    console.log(`   Modo MP: ${isTestMode ? 'Prueba' : 'Producción'}`);
    console.warn(`   Moneda MP: ${MP_CURRENCY_ID}`);
    if (supabase) console.log(`   Conectado a Supabase.`);
    console.log(`   Webhook: http://localhost:${port}/mercado_pago_webhook (Necesita URL pública)`);
});


// --- ¡IMPORTANTE! Función RPC 'descontar_stock' en Supabase ---
/*
-- Ejecuta esto en tu Editor SQL de Supabase:

CREATE OR REPLACE FUNCTION descontar_stock(item_upc text, cantidad_a_descontar int)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  stock_actual int;
BEGIN
  -- Bloquear la fila para evitar problemas de concurrencia
  SELECT unidades INTO stock_actual FROM medicamentos WHERE upc = item_upc FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Medicamento con UPC % no encontrado.', item_upc;
  END IF;

  IF stock_actual < cantidad_a_descontar THEN
    -- Puedes decidir si lanzar error o solo registrarlo
    RAISE WARNING 'Stock insuficiente para UPC %. Stock actual: %, se intentó descontar: %', item_upc, stock_actual, cantidad_a_descontar;
    -- Para lanzar error y detener (si usas transacción en el futuro):
    -- RAISE EXCEPTION 'Stock insuficiente para UPC %. Stock actual: %, se intentó descontar: %', item_upc, stock_actual, cantidad_a_descontar;
    RETURN; -- No hacer nada si no quieres error, pero el WARNING queda en logs
  END IF;

  -- Realizar el descuento
  UPDATE medicamentos
  SET unidades = unidades - cantidad_a_descontar
  WHERE upc = item_upc;

  RAISE NOTICE 'Stock descontado para UPC %: % unidades.', item_upc, cantidad_a_descontar;
END;
$$;

*/