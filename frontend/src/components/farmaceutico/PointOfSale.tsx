"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search, ShoppingCart, User, Plus, Minus, X, CreditCard, DollarSign,
  AlertCircle, CheckCircle, Calendar, Trash2, QrCode, Loader2, Phone,
  AlertTriangle, Fingerprint, // Usaremos este para RFID
  Camera // Usaremos este para Facial
} from "lucide-react";
import QRCode from "qrcode";
import supabase from "../../lib/supabaseClient"; // Asegúrate que la ruta y config sean correctas
import RFIDMAS from "../farmaceutico/RFIDReader"
// --- Interfaces ---
interface Product { upc: string; nombre_medicamento: string; precio_en_pesos: number; unidades: number; [key: string]: any; }
interface CartItem extends Product { cantidad: number; }
interface StockWarning { message: string; productId: string; }
interface Patient { id: string; name: string; surecode?: string; phone?: string; allergies?: string; }
// --- Fin Interfaces ---

const PointOfSale = () => {
  // --- Estados POS ---
  const [productSearch, setProductSearch] = useState<string>("");
  const [searchResults, setSearchResults] = useState<Product[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [productQuantity, setProductQuantity] = useState<number>(1);
  const [isSearchingDb, setIsSearchingDb] = useState<boolean>(false);
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [stockWarning, setStockWarning] = useState<StockWarning | null>(null);
  const [selectedPatientData, setSelectedPatientData] = useState<Patient | null>(null);
  const [buyWithoutAccount, setBuyWithoutAccount] = useState<boolean>(false);
  const [showValidationMessage, setShowValidationMessage] = useState<boolean>(false);
  const [activeIdentificationModal, setActiveIdentificationModal] = useState<'code' | 'facial' | 'rfid' | null>(null);
  const [patientSearchQuery, setPatientSearchQuery] = useState<string>("");
  const [isSearchingPatient, setIsSearchingPatient] = useState<boolean>(false);
  const [patientSearchError, setPatientSearchError] = useState<string | null>(null); // Usado también para errores de cámara

  // --- Estados Cámara (Integrados y funcionales) ---
  const [showCamera, setShowCamera] = useState<boolean>(false); // Controla si INTENTAMOS mostrar la cámara
  const [stream, setStream] = useState<MediaStream | null>(null); // El stream de la cámara
  const videoRef = useRef<HTMLVideoElement>(null); // Ref al elemento video HTML
  const [isCameraLoading, setIsCameraLoading] = useState<boolean>(false); // Para feedback visual

  // --- Estados Pago ---
  const [paymentMethod, setPaymentMethod] = useState<string>("efectivo");
  const [showPaymentModal, setShowPaymentModal] = useState<boolean>(false);
  const [amountPaid, setAmountPaid] = useState<string>("");
  const [receiptNumber, setReceiptNumber] = useState<number | null>(null);
  const [currentOrderId, setCurrentOrderId] = useState<number | string | null>(null);
  const [isGeneratingQR, setIsGeneratingQR] = useState<boolean>(false);
  const [mercadoPagoQrUrl, setMercadoPagoQrUrl] = useState<string | null>(null);
  const [qrError, setQrError] = useState<string | null>(null);
  const [isConfirmingCash, setIsConfirmingCash] = useState<boolean>(false);
  const [cashConfirmationError, setCashConfirmationError] = useState<string | null>(null);

  // --- Estados UI ---
  const [isSearchFocused, setIsSearchFocused] = useState<boolean>(false);
  // --- Fin Estados ---


  // --- Funciones POS (Sin cambios mayormente) ---
  const getStockPercentage = (available: number, max: number): number => { if (max <= 0) return 100; return Math.min(100, Math.max(0, (available / max) * 100)); };
  const getStockLevelColor = (percentage: number): string => { if (percentage <= 20) return "bg-red-500"; if (percentage <= 50) return "bg-amber-500"; return "bg-emerald-500"; };
  const handleProductSearch = useCallback(async (term: string) => { setProductSearch(term); setSearchResults([]); if (term.length < 3) { setIsSearchingDb(false); return; } setIsSearchingDb(true); try { const { data, error } = await supabase.from("medicamentos").select("upc, nombre_medicamento, precio_en_pesos, unidades").ilike("nombre_medicamento", `%${term}%`).order("nombre_medicamento").limit(15); if (error) throw error; setSearchResults(data || []); } catch (err) { console.error("Fallo búsqueda producto:", err); setSearchResults([]); } finally { setIsSearchingDb(false); } }, []);
  const handleSelectProduct = (product: Product) => { setSelectedProduct(product); setSearchResults([]); setProductSearch(product.nombre_medicamento); setProductQuantity(1); setIsSearchFocused(false); };
  // const checkStockAvailability = (product: Product, quantity: number): boolean => { const existingItem = cartItems.find((item) => item.upc === product.upc); const currentInCart = existingItem ? existingItem.cantidad : 0; const totalNeeded = existingItem ? quantity : currentInCart + quantity; const stockReal = product.unidades; return totalNeeded <= stockReal; }; // No usada directamente?
  const handleAddToCart = () => { if (!selectedProduct) return; const stockCheckProduct = { ...selectedProduct }; const existingItem = cartItems.find((item) => item.upc === selectedProduct.upc); const currentInCart = existingItem ? existingItem.cantidad : 0; const needed = productQuantity; const totalAfterAdd = currentInCart + needed; if (totalAfterAdd > stockCheckProduct.unidades) { setStockWarning({ message: `Stock insuficiente (${stockCheckProduct.unidades} disp.)`, productId: stockCheckProduct.upc }); setTimeout(() => setStockWarning(null), 3000); return; } if (existingItem) { setCartItems(cartItems.map((item) => item.upc === selectedProduct.upc ? { ...item, cantidad: totalAfterAdd } : item)); } else { const qtyToAdd = Math.min(productQuantity, selectedProduct.unidades); if (qtyToAdd > 0) { setCartItems([...cartItems, { ...selectedProduct, cantidad: qtyToAdd }]); } else { setStockWarning({ message: `No hay stock`, productId: selectedProduct.upc }); setTimeout(() => setStockWarning(null), 3000); } } setSelectedProduct(null); setProductSearch(""); setProductQuantity(1); setSearchResults([]); };
  const handleRemoveFromCart = (upc: string) => { setCartItems(cartItems.filter((item) => item.upc !== upc)); };
  const handleUpdateQuantity = (upc: string, newQuantity: number) => { if (newQuantity < 1) return handleRemoveFromCart(upc); const item = cartItems.find((item) => item.upc === upc); if (!item) return; if (newQuantity > item.unidades) { setStockWarning({ message: `Stock max: ${item.unidades}`, productId: upc }); setTimeout(() => setStockWarning(null), 3000); return; } setCartItems(cartItems.map((cartItem) => (cartItem.upc === upc ? { ...cartItem, cantidad: newQuantity } : cartItem))); };
  const calculateTotal = useCallback((): number => { return cartItems.reduce((total, item) => total + item.precio_en_pesos * item.cantidad, 0); }, [cartItems]);

  // Búsqueda Paciente por Código
  const handlePatientSearchSubmit = async (e?: React.FormEvent) => { if (e) e.preventDefault(); if (!patientSearchQuery.trim()) { setPatientSearchError("Ingrese código (surecode)"); return; } setIsSearchingPatient(true); setPatientSearchError(null); setSelectedPatientData(null); try { const { data, error } = await supabase.from("patients").select("id, name, surecode, phone, allergies").eq("surecode", patientSearchQuery.trim()).single(); if (error) { if (error.code === "PGRST116") { setPatientSearchError("Paciente no encontrado."); } else { throw error; } setSelectedPatientData(null); } else if (data) { setSelectedPatientData(data as Patient); setPatientSearchError(null); setActiveIdentificationModal(null); } } catch (err: any) { console.error("Error buscando paciente:", err); setPatientSearchError("Error al buscar."); } finally { setIsSearchingPatient(false); } };
  // --- Fin Funciones POS ---


  // **** FUNCIONES DE CÁMARA (Versión funcional integrada) ****
  const startCamera = useCallback(async () => {
    // 1. Pre-checks y estado de carga
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      console.error("getUserMedia not supported");
      setPatientSearchError("Tu navegador no soporta el acceso a la cámara.");
      setIsCameraLoading(false);
      setShowCamera(false);
      return;
    }
    console.log("[Camera] Attempting start...");
    setPatientSearchError(null); // Limpiar errores previos del modal
    setIsCameraLoading(true);
    setShowCamera(true); // Indicamos la INTENCIÓN de mostrarla

    try {
      // 2. Obtener el stream
      const mediaStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
      console.log("[Camera] Stream obtained:", mediaStream);

      // 3. Asignar al video Ref
      if (videoRef.current) {
        console.log("[Camera] Assigning stream to videoRef:", videoRef.current);
        videoRef.current.srcObject = mediaStream;
         await videoRef.current.play().catch(playErr => {
             console.error("[Camera] Error trying to play video:", playErr);
             // No establecer error aquí necesariamente, autoPlay debería funcionar
         });
        setStream(mediaStream);
        console.log("[Camera] Stream assigned.");
      } else {
        console.error("[Camera] videoRef.current is NULL when assigning stream!");
        setPatientSearchError("No se pudo acceder al elemento de video. Intenta de nuevo.");
        mediaStream.getTracks().forEach(track => track.stop());
        setShowCamera(false);
        setStream(null);
      }
    } catch (err: any) {
      // 4. Manejo de Errores
      console.error("[Camera] Error in getUserMedia:", err.name, err.message);
      if (err.name === "NotAllowedError") {
        setPatientSearchError("Permiso de cámara denegado. Revísalo en la configuración de tu navegador.");
      } else if (err.name === "NotFoundError" || err.name === "DevicesNotFoundError") {
        setPatientSearchError("No se encontró una cámara conectada.");
      } else if (err.name === "NotReadableError") {
         setPatientSearchError("La cámara está siendo usada por otra aplicación o hubo un error de hardware.");
      } else {
        setPatientSearchError(`Error de cámara (${err.name}). Intenta de nuevo.`);
      }
      setShowCamera(false);
      setStream(null);
    } finally {
      // 5. Finalizar estado de carga
      setIsCameraLoading(false);
      console.log("[Camera] Start attempt finished.");
    }
  }, [setPatientSearchError, setIsCameraLoading, setShowCamera, setStream]); // Dependencias: setters son estables

  const stopCamera = useCallback(() => {
    console.log("[Camera] Stopping...");
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      console.log("[Camera] Tracks stopped.");
    } else {
        console.log("[Camera] No active stream to stop.");
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
      videoRef.current.load();
    }
    setStream(null);
    setShowCamera(false);
    setIsCameraLoading(false);
    // NO limpiamos patientSearchError aquí, podría haber otro error no relacionado a la cámara
    // Se limpia al abrir modal o al iniciar cámara de nuevo.
  }, [stream, setStream, setShowCamera, setIsCameraLoading]); // Depende de stream y setters

  // Efecto para DETENER la cámara si el modal FACIAL se cierra o cambia a otro tipo
  useEffect(() => {
    if (activeIdentificationModal !== 'facial') {
      if (showCamera || isCameraLoading || stream) {
          console.log("[Effect] Modal is not 'facial' or closed. Stopping camera.");
          stopCamera();
      }
    }
  }, [activeIdentificationModal, showCamera, isCameraLoading, stream, stopCamera]);
  // -------------------------------------------------------


  // --- Funciones Paciente/Venta y Pago (Continuación) ---
  const deselectPatient = () => { setSelectedPatientData(null); setPatientSearchQuery(""); setPatientSearchError(null); };
  const validateClientInfo = (): boolean => { const isValid = buyWithoutAccount || !!selectedPatientData; setShowValidationMessage(!isValid); return isValid; };
  const handleBuyWithoutAccount = () => { const newVal = !buyWithoutAccount; setBuyWithoutAccount(newVal); if (newVal) { deselectPatient(); setShowValidationMessage(false); } };
  const generateMercadoPagoQrCode = useCallback(async () => { if (isGeneratingQR || mercadoPagoQrUrl) return; const total = calculateTotal(); if (total <= 0) { setQrError("Monto debe ser > 0."); return; } const description = `Venta POS #${Date.now().toString().slice(-5)}`; setIsGeneratingQR(true); setQrError(null); setCurrentOrderId(null); try { const body = { amount: total, description, paciente_id: selectedPatientData?.id || null, compra_sin_cuenta: buyWithoutAccount, cartItems }; const response = await fetch('http://localhost:3000/create_order', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); const data = await response.json(); if (!response.ok) throw new Error(data.message || 'Error servidor creando pref MP.'); if (data.init_point_url && data.order_id) { setCurrentOrderId(data.order_id); const qrDataURL = await QRCode.toDataURL(data.init_point_url, { errorCorrectionLevel: 'L', margin: 1, scale: 5 }); setMercadoPagoQrUrl(qrDataURL); } else { throw new Error('Respuesta inválida (falta URL/order_id).'); } } catch (err: any) { console.error("Error generando QR:", err); setQrError(err.message || "Error al generar QR."); } finally { setIsGeneratingQR(false); } }, [cartItems, selectedPatientData, buyWithoutAccount, isGeneratingQR, mercadoPagoQrUrl, calculateTotal]);
  const handleCheckout = () => { if (cartItems.length === 0) return; if (!validateClientInfo()) return; setMercadoPagoQrUrl(null); setQrError(null); setIsGeneratingQR(false); setCurrentOrderId(null); setCashConfirmationError(null); setIsConfirmingCash(false); setShowPaymentModal(true); };
  useEffect(() => { if (showPaymentModal && paymentMethod === 'mercadoPagoQR') { generateMercadoPagoQrCode(); } }, [showPaymentModal, paymentMethod, generateMercadoPagoQrCode]);

  const resetPOSState = useCallback(() => {
    console.log("Resetting POS State...");
    stopCamera(); // Asegurar detener la cámara al resetear
    setCartItems([]);
    setSelectedPatientData(null);
    setPatientSearchQuery("");
    setPatientSearchError(null);
    setActiveIdentificationModal(null);
    setBuyWithoutAccount(false);
    setShowPaymentModal(false);
    setReceiptNumber(null);
    setAmountPaid("");
    setPaymentMethod("efectivo");
    setMercadoPagoQrUrl(null);
    setIsGeneratingQR(false);
    setQrError(null);
    setCurrentOrderId(null);
    setSelectedProduct(null);
    setProductSearch("");
    setProductQuantity(1);
    setSearchResults([]);
    setShowValidationMessage(false);
    setIsConfirmingCash(false);
    setCashConfirmationError(null);
    setIsSearchFocused(false);
    setIsSearchingDb(false);
    setIsSearchingPatient(false);
    setStockWarning(null);
  }, [stopCamera]); // stopCamera es dependencia estable

  const handleCompletePayment = async () => { setCashConfirmationError(null); if (paymentMethod === 'efectivo') { setIsConfirmingCash(true); setCashConfirmationError(null); try { const total = calculateTotal(); const description = `Venta POS Efectivo #${Date.now().toString().slice(-5)}`; const body = { amount: total, description, paciente_id: selectedPatientData?.id || null, compra_sin_cuenta: buyWithoutAccount, cartItems, payment_method: 'efectivo' }; const response = await fetch('http://localhost:3000/create_order', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); const data = await response.json(); if (!response.ok) throw new Error(data.message || 'Error servidor creando orden efectivo.'); if (!data.order_id) throw new Error('Respuesta inválida (falta order_id).'); const newReceipt = data.receipt_number || Math.floor(Math.random() * 10000); setReceiptNumber(newReceipt); setTimeout(resetPOSState, 3000); } catch (error: any) { console.error("Error creando/confirmando efectivo:", error); setCashConfirmationError(error.message || "Error al procesar venta en efectivo."); } finally { setIsConfirmingCash(false); } } else if (paymentMethod === 'mercadoPagoQR') { const newReceipt = Math.floor(Math.random() * 10000); setReceiptNumber(newReceipt); setTimeout(resetPOSState, 3000); } };

  const openSearchModal = (method: 'code' | 'facial' | 'rfid') => {
      setPatientSearchQuery(""); // Limpiar query de búsqueda de paciente
      setPatientSearchError(null); // Limpiar errores del modal anterior
      if (method !== 'facial' && (showCamera || isCameraLoading)) {
          stopCamera(); // Detener si abrimos otro modal y la cámara estaba activa
      }
      setActiveIdentificationModal(method);
      // No iniciamos cámara aquí, el usuario lo hace con el botón
  };

  const closeSearchModal = () => {
      stopCamera(); // Siempre detener la cámara al cerrar el modal
      setActiveIdentificationModal(null);
  };
  // --- Fin Funciones ---


  // --- RENDERIZADO JSX ---
  return (
    <div className="min-h-screen bg-gray-100">
      <div className="container mx-auto px-4 py-6">
        {/* Header */}
        <header className="mb-8"> <h1 className="text-3xl font-bold text-gray-800">Bienvenid@ a Point</h1> </header>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* --- Panel Izquierdo (Búsqueda, Producto, Paciente) --- */}
          <div className="lg:col-span-2 space-y-6">
            {/* Búsqueda Producto */}
            <div className="bg-white rounded-xl shadow p-6 border border-gray-200 relative">
               {/* ... (Input y resultados de búsqueda sin cambios) ... */}
               <div className="relative"> <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none"> {isSearchingDb ? (<Loader2 className="h-5 w-5 text-gray-400 animate-spin" />) : (<Search className="h-5 w-5 text-gray-400" />)} </div> <input type="text" placeholder="Buscar medicamento..." className="w-full pl-12 pr-10 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition" value={productSearch} onChange={(e) => handleProductSearch(e.target.value)} onFocus={() => setIsSearchFocused(true)} onBlur={() => setTimeout(() => setIsSearchFocused(false), 200)} /> {productSearch && (<button onClick={() => { setProductSearch(""); setSearchResults([]); setIsSearchingDb(false); }} className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600" > <X className="h-5 w-5" /> </button> )} </div> <AnimatePresence> {isSearchFocused && (productSearch.length > 2) && (searchResults.length > 0 || isSearchingDb) && ( <motion.div initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }} className="mt-1 bg-white rounded-b-lg border-x border-b border-gray-200 shadow-md overflow-hidden absolute w-[calc(100%-3rem)] z-20" > <div className="max-h-60 overflow-y-auto divide-y divide-gray-100"> {isSearchingDb && searchResults.length === 0 && (<div className="p-4 text-center text-sm text-gray-500">Buscando...</div>)} {!isSearchingDb && searchResults.length === 0 && productSearch.length > 2 && (<div className="p-4 text-center text-sm text-gray-500">No se encontraron resultados.</div>)} {searchResults.map((product) => ( <div key={product.upc} className="p-3 hover:bg-blue-50 cursor-pointer transition-colors" onClick={() => handleSelectProduct(product)} > <div className="flex justify-between items-center"> <div><h4 className="font-medium text-sm text-gray-800">{product.nombre_medicamento}</h4><p className="text-xs text-gray-500">UPC: {product.upc}</p></div> <div className="text-right flex-shrink-0 ml-4"><p className="font-semibold text-blue-600 text-sm">${product.precio_en_pesos?.toFixed(2)}</p><span className={`text-xs px-1.5 py-0.5 rounded-full ${ product.unidades > 10 ? "bg-green-100 text-green-700" : product.unidades > 0 ? "bg-yellow-100 text-yellow-700" : "bg-red-100 text-red-700" }`}>{product.unidades} disp.</span></div> </div> </div> ))} </div> </motion.div> )} </AnimatePresence>
             </div>
            {/* Producto Seleccionado */}
            <AnimatePresence>
              {selectedProduct && (
                 <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }} className="bg-white rounded-xl shadow p-6 border border-gray-200" >
                  {/* ... (Contenido del producto seleccionado sin cambios) ... */}
                  <div className="flex justify-between items-start mb-4"> <div><h2 className="text-lg font-semibold text-gray-800">{selectedProduct.nombre_medicamento}</h2><p className="text-sm text-gray-500">UPC: {selectedProduct.upc}</p></div> <div className="flex items-center gap-2"><span className="text-xl font-bold text-blue-600">${selectedProduct.precio_en_pesos?.toFixed(2)}</span><button onClick={() => setSelectedProduct(null)} className="p-1 text-gray-400 hover:text-red-500 rounded-full hover:bg-red-50"><X className="h-4 w-4" /></button></div> </div> <div className="flex flex-wrap gap-4 items-center"> <div className="flex-grow min-w-[120px]"> <label className="text-xs text-gray-500 block mb-1">Stock Disp: {selectedProduct.unidades}</label> <div className="h-2 bg-gray-200 rounded-full overflow-hidden"><div className={`h-full rounded-full ${getStockLevelColor(getStockPercentage(selectedProduct.unidades, selectedProduct.unidades))}`} style={{ width: `${getStockPercentage(selectedProduct.unidades, selectedProduct.unidades)}%` }}></div></div> </div> <div className="flex items-center border border-gray-300 rounded-lg"><button onClick={() => productQuantity > 1 && setProductQuantity(productQuantity - 1)} className="px-3 py-2 text-gray-600 hover:bg-gray-100 disabled:opacity-50" disabled={productQuantity <= 1}><Minus className="h-4 w-4" /></button><input type="number" min="1" max={selectedProduct.unidades} value={productQuantity} onChange={(e) => { const v = parseInt(e.target.value); if (!isNaN(v) && v > 0 && v <= selectedProduct.unidades) setProductQuantity(v); else if (v > selectedProduct.unidades) setProductQuantity(selectedProduct.unidades); else if (v <= 0) setProductQuantity(1)}} className="w-14 text-center border-x border-gray-300 focus:ring-0 focus:border-gray-300 py-2"/> <button onClick={() => productQuantity < selectedProduct.unidades && setProductQuantity(productQuantity + 1)} className="px-3 py-2 text-gray-600 hover:bg-gray-100 disabled:opacity-50" disabled={productQuantity >= selectedProduct.unidades}><Plus className="h-4 w-4" /></button></div> <button onClick={handleAddToCart} className="px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition flex items-center gap-1.5 text-sm font-medium"><ShoppingCart className="h-4 w-4" /><span>Agregar</span></button> </div> {stockWarning && stockWarning.productId === selectedProduct.upc && (<div className="mt-3 p-2 bg-yellow-50 border border-yellow-200 rounded-lg text-xs text-yellow-800 flex items-center gap-1.5"><AlertCircle className="h-4 w-4" /><p>{stockWarning.message}</p></div>)}
                 </motion.div>
              )}
            </AnimatePresence>
            {/* Sección Paciente */}
            <div className="bg-white rounded-xl shadow p-6 border border-gray-200">
              {/* ... (Contenido de la sección paciente sin cambios) ... */}
              <div className="flex justify-between items-center mb-4"> <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2"> <User className="h-5 w-5 text-blue-600" /> Paciente </h2> <button onClick={handleBuyWithoutAccount} className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${ buyWithoutAccount ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200" }`} > {buyWithoutAccount ? "Venta General ✓" : "Venta General"} </button> </div> {showValidationMessage && ( <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 flex items-center gap-2"> <AlertCircle className="h-5 w-5" /> <span>Se requiere paciente o marcar "Venta General".</span> </div> )} <AnimatePresence> {selectedPatientData && !buyWithoutAccount && ( <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg relative" > <button onClick={deselectPatient} title="Quitar paciente" className="absolute top-2 right-2 p-1 text-red-500 hover:text-red-700 rounded-full hover:bg-red-100"> <X className="h-4 w-4" /> </button> <p className="font-semibold text-green-800 text-base">{selectedPatientData.name}</p> <p className="text-xs text-gray-600">ID: {selectedPatientData.id.substring(0,8)}...</p> {selectedPatientData.surecode && <p className="text-xs text-gray-600">Código: {selectedPatientData.surecode}</p>} <p className="text-xs text-gray-600">Tel: {selectedPatientData.phone || 'N/A'}</p> </motion.div> )} </AnimatePresence> {!selectedPatientData && !buyWithoutAccount && ( <div className="pt-2"> <label className="block text-sm font-medium text-gray-600 mb-2">Identificar Paciente por:</label> <div className="grid grid-cols-1 sm:grid-cols-3 gap-3"> <button onClick={() => openSearchModal('code')} className="flex items-center justify-center gap-2 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition text-sm"> <Search className="h-4 w-4"/> Código </button> <button onClick={() => openSearchModal('facial')} className="flex items-center justify-center gap-2 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition text-sm"> <Camera className="h-4 w-4"/> Facial </button> <button onClick={() => openSearchModal("rfid")} className="flex items-center justify-center gap-2 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition text-sm"> <Fingerprint className="h-4 w-4"/> RFID </button> </div> </div> )}
            </div>
          </div>

          {/* --- Panel Derecho (Carrito y Pago) --- */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-xl shadow p-6 border border-gray-200 sticky top-6">
              {/* ... (Contenido del carrito y pago sin cambios) ... */}
              <div className="flex justify-between items-center mb-4 pb-4 border-b border-gray-200"> <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2"> <ShoppingCart className="h-5 w-5 text-blue-600" /> Carrito </h2> <span className="px-2.5 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-semibold"> {cartItems.reduce((acc, item) => acc + item.cantidad, 0)} items </span> </div> {cartItems.length === 0 ? ( <div className="py-10 text-center text-gray-500"> <ShoppingCart className="h-10 w-10 mx-auto mb-2 text-gray-400" /> <p>El carrito está vacío.</p> </div> ) : ( <div className="space-y-3 max-h-[calc(100vh-30rem)] overflow-y-auto pr-2 mb-4 custom-scrollbar"> {cartItems.map((item) => ( <div key={item.upc} className="p-3 border border-gray-200 rounded-lg flex gap-3 items-center"> <div className="flex-1 min-w-0"> <p className="font-medium text-sm text-gray-800 truncate">{item.nombre_medicamento}</p> <p className="text-xs text-gray-500">${item.precio_en_pesos.toFixed(2)} c/u</p> </div> <div className="flex items-center border border-gray-200 rounded"> <button onClick={() => handleUpdateQuantity(item.upc, item.cantidad - 1)} className="px-2 py-1 text-gray-600 hover:bg-gray-100 disabled:opacity-50" disabled={item.cantidad <= 1}><Minus className="h-3 w-3" /></button> <span className="px-2 text-sm font-medium">{item.cantidad}</span> <button onClick={() => handleUpdateQuantity(item.upc, item.cantidad + 1)} className="px-2 py-1 text-gray-600 hover:bg-gray-100 disabled:opacity-50" disabled={item.cantidad >= item.unidades}><Plus className="h-3 w-3" /></button> </div> <p className="font-semibold text-sm w-16 text-right">${(item.precio_en_pesos * item.cantidad).toFixed(2)}</p> <button onClick={() => handleRemoveFromCart(item.upc)} className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"><Trash2 className="h-4 w-4" /></button> </div> ))} </div> )} {cartItems.length > 0 && ( <div className="border-t border-gray-200 pt-4 space-y-4"> <div className="flex justify-between font-semibold text-lg"> <span>Total:</span> <span className="text-blue-600">${calculateTotal().toFixed(2)}</span> </div> <div className="space-y-2"> <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider">Método de Pago</label> <div className="grid grid-cols-2 gap-2"> <button onClick={() => setPaymentMethod("efectivo")} className={`py-2.5 px-2 rounded-lg border flex items-center justify-center gap-1.5 transition ${ paymentMethod === "efectivo" ? "bg-blue-600 border-blue-600 text-white shadow-sm" : "bg-white border-gray-300 text-gray-700 hover:border-gray-400" }`} > <DollarSign className="h-4 w-4" /> <span className="text-sm font-medium">Efectivo</span> </button> <button onClick={() => setPaymentMethod("mercadoPagoQR")} className={`py-2.5 px-2 rounded-lg border flex items-center justify-center gap-1.5 transition ${ paymentMethod === "mercadoPagoQR" ? "bg-blue-600 border-blue-600 text-white shadow-sm" : "bg-white border-gray-300 text-gray-700 hover:border-gray-400" }`} > <QrCode className="h-4 w-4" /> <span className="text-sm font-medium">MP QR</span> </button> </div> </div> <button onClick={handleCheckout} disabled={cartItems.length === 0 || (!buyWithoutAccount && !selectedPatientData)} className={`w-full py-3 rounded-lg font-semibold text-base flex items-center justify-center gap-2 ${ (cartItems.length === 0 || (!buyWithoutAccount && !selectedPatientData)) ? "bg-gray-300 text-gray-500 cursor-not-allowed" : "bg-green-600 text-white hover:bg-green-700 transition" }`} > <CheckCircle className="h-5 w-5" /> <span>Proceder al Pago</span> </button> {showValidationMessage && ( <p className="text-xs text-red-600 text-center mt-1">Selecciona un paciente o marca "Venta General".</p> )} </div> )}
            </div>
          </div>
        </div>
      </div>

      {/* --- Modal Identificación --- */}
       <AnimatePresence>
         {activeIdentificationModal && (
           <motion.div
             initial={{ opacity: 0 }}
             animate={{ opacity: 1 }}
             exit={{ opacity: 0 }}
             className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center p-4 z-40 backdrop-blur-sm"
             onClick={closeSearchModal} // Cerrar al hacer clic fuera
           >
             <motion.div
               initial={{ scale: 0.9, opacity: 0 }}
               animate={{ scale: 1, opacity: 1 }}
               exit={{ scale: 0.9, opacity: 0 }}
               className="bg-white rounded-xl max-w-lg w-full p-6 shadow-xl relative"
               onClick={(e) => e.stopPropagation()} // Evitar que el clic dentro cierre el modal
             >
               <button onClick={closeSearchModal} className="absolute top-3 right-3 p-1.5 text-gray-400 hover:text-gray-700 rounded-full hover:bg-gray-100">
                 <X className="h-5 w-5" />
               </button>

               {/* --- Contenido del Modal --- */}

               {/* Código */}
               {activeIdentificationModal === 'code' && (
                 <div className="space-y-4">
                   <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2"><Search className="h-5 w-5 text-blue-600" /> Buscar Paciente por Código</h3>
                   <form onSubmit={handlePatientSearchSubmit}>
                     <label htmlFor="patient-code-search" className="block text-sm font-medium text-gray-600 mb-1">Código (Surecode)</label>
                     <div className="flex gap-2">
                       <input id="patient-code-search" type="text" placeholder="Ingrese el código..." className={`flex-grow px-3 py-2 border rounded-md focus:outline-none focus:ring-1 transition ${isSearchingPatient ? 'bg-gray-100' : 'border-gray-300 focus:ring-blue-500'}`} value={patientSearchQuery} onChange={(e) => setPatientSearchQuery(e.target.value)} disabled={isSearchingPatient} autoFocus />
                       <button type="submit" className={`px-4 py-2 rounded-md text-white flex items-center justify-center gap-1.5 text-sm font-medium transition ${isSearchingPatient ? 'bg-gray-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'}`} disabled={isSearchingPatient}>
                         {isSearchingPatient ? <Loader2 className="h-4 w-4 animate-spin"/> : <Search className="h-4 w-4" />}
                         <span>Buscar</span>
                       </button>
                     </div>
                   </form>
                   {/* Mostrar error de búsqueda de paciente (si existe y no es un error de cámara) */}
                   {patientSearchError && !isCameraLoading && !showCamera && (
                        <p className="text-sm text-red-600 mt-2">{patientSearchError}</p>
                   )}
                 </div>
               )}

               {/* RFID */}
               {activeIdentificationModal === 'rfid' && (
                 <div className="space-y-4 text-center">
                   <RFIDMAS 
                     onPatientIdentified={(patientData) => {
                       // Convertir los datos del paciente al formato esperado por PointOfSale
                       const patient: Patient = {
                         id: patientData.id.toString(),
                         name: patientData.name,
                         surecode: patientData.surecode,
                         phone: patientData.phone,
                         allergies: patientData.allergies
                       };
                       
                       // Establecer el paciente seleccionado
                       setSelectedPatientData(patient);
                       
                       // Cerrar el modal después de identificar al paciente
                       setTimeout(() => {
                         closeSearchModal();
                       }, 1500);
                     }}
                   />
                 </div>
               )}

               {/* --- FACIAL (JSX Integrado y Funcional) --- */}
               {activeIdentificationModal === 'facial' && (
                 <div className="space-y-4 text-center">
                   <h3 className="text-lg font-semibold text-gray-800 flex items-center justify-center gap-2">
                     <Camera className="h-5 w-5 text-blue-600" /> Reconocimiento Facial
                   </h3>

                   {/* Área del Video/Placeholder */}
                   <div className="relative rounded-lg overflow-hidden bg-gray-900 aspect-video max-w-xs mx-auto border-2 border-gray-300">
                     {/* Video Element */}
                     <video
                       ref={videoRef}
                       autoPlay
                       playsInline
                       muted
                       className={`w-full h-full object-cover block transform scale-x-[-1] transition-opacity duration-300 ${
                         showCamera && !isCameraLoading && stream ? 'opacity-100' : 'opacity-0'
                       }`}
                     ></video>

                     {/* Placeholder / Loading / Error Overlay */}
                     <div className={`absolute inset-0 flex flex-col items-center justify-center transition-opacity duration-300 ${showCamera && !isCameraLoading && stream ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
                       {isCameraLoading ? (
                         <>
                           <Loader2 className="h-8 w-8 text-blue-300 animate-spin mb-2" />
                           <span className="text-sm text-gray-300">Iniciando cámara...</span>
                         </>
                       ) : patientSearchError ? ( // Usamos patientSearchError para mostrar errores de cámara aquí
                          <div className="p-4 text-center">
                              <AlertTriangle className="h-8 w-8 text-red-400 mb-2 mx-auto"/>
                              <span className="text-xs text-red-300">{patientSearchError}</span>
                          </div>
                       ) : (
                         <>
                           <Camera className="h-12 w-12 text-gray-500 opacity-50 mb-2" />
                           <span className="text-sm text-gray-400">Cámara desactivada</span>
                         </>
                       )}
                     </div>
                   </div>

                   {/* Botones de Control */}
                   <div className="flex justify-center gap-3">
                      {!showCamera && !isCameraLoading && (
                         <button
                            onClick={startCamera}
                            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm flex items-center gap-1.5"
                         >
                            <Camera className="h-4 w-4"/>Activar Cámara
                         </button>
                      )}
                      {showCamera && !isCameraLoading && (
                         <button
                            onClick={stopCamera}
                            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm flex items-center gap-1.5"
                         >
                            <X className="h-4 w-4"/>Detener Cámara
                         </button>
                      )}
                       {isCameraLoading && (
                          <button className="px-4 py-2 bg-gray-500 text-white rounded-lg cursor-wait text-sm flex items-center gap-1.5" disabled>
                             <Loader2 className="h-4 w-4 animate-spin"/> Cargando...
                          </button>
                      )}
                   </div>
                   {/* Botón de identificar (deshabilitado por ahora) */}
                    {showCamera && !isCameraLoading && stream && (
                         <button className="mt-2 px-4 py-2 bg-gray-400 text-white rounded-lg cursor-not-allowed text-sm" disabled>
                           Identificar (N/I)
                         </button>
                    )}

                   {/* Mensaje informativo */}
                   {!isCameraLoading && !patientSearchError && showCamera && (
                      <p className="text-xs text-gray-500 mt-2">Alinea tu rostro. (Identificación no implementada).</p>
                   )}
                 </div>
               )}
               {/* --- FIN FACIAL --- */}

             </motion.div>
           </motion.div>
         )}
       </AnimatePresence>

      {/* --- Modal de Pago --- */}
      <AnimatePresence>
        {showPaymentModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center p-4 z-50 backdrop-blur-sm" >
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="bg-white rounded-xl max-w-sm w-full p-6 shadow-xl" >
              {/* Vista Completado */}
              {receiptNumber ? (
                <div className="text-center">
                 {/* ... (Contenido de venta completada sin cambios) ... */}
                 <div className="w-16 h-16 mx-auto bg-green-100 rounded-full flex items-center justify-center mb-4"><CheckCircle className="h-8 w-8 text-green-600" /></div> <h3 className="text-lg font-semibold text-gray-900">¡Venta Completada!</h3> <p className="text-sm text-gray-500 mt-1">Recibo #{receiptNumber}</p> <p className="mt-3 text-xl font-bold text-gray-800">Total: ${calculateTotal().toFixed(2)}</p> {paymentMethod === "efectivo" && amountPaid && (<div className="mt-2 text-xs text-gray-500"> Pagado: ${Number.parseFloat(amountPaid).toFixed(2)} | Cambio: ${(Number.parseFloat(amountPaid) - calculateTotal()).toFixed(2)} </div> )} {paymentMethod === "mercadoPagoQR" && ( <p className="mt-2 text-xs text-blue-600 font-medium"> (Pago con MP QR Procesado) </p> )} <div className="mt-4 p-2 bg-gray-100 rounded text-xs text-gray-500">Cerrando automáticamente...</div>
                 </div>
              ) : (
                /* Vista para Pagar */
                <>
                  {/* ... (Contenido del modal de pago sin cambios) ... */}
                  <div className="flex justify-between items-center mb-4 pb-4 border-b"> <h3 className="text-lg font-semibold text-gray-900">Confirmar Pago</h3> <button onClick={() => setShowPaymentModal(false)} className="p-1 text-gray-400 hover:text-gray-700 rounded-full hover:bg-gray-100"><X className="h-5 w-5" /></button> </div> <div className="space-y-4"> <div className="text-center"> <span className="text-sm text-gray-500 block">Total a Pagar</span> <span className="text-3xl font-bold text-blue-600">${calculateTotal().toFixed(2)}</span> </div> {/* EFECTIVO */} {paymentMethod === "efectivo" && ( <div className="space-y-2"> <label htmlFor="amount-paid" className="block text-sm font-medium text-gray-700">Monto Recibido</label> <div className="relative"> <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-500">$</span> <input id="amount-paid" type="number" min={calculateTotal()} step="0.01" placeholder={calculateTotal().toFixed(2)} className="block w-full pl-7 pr-4 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-lg" value={amountPaid} onChange={(e) => setAmountPaid(e.target.value)} /> </div> {cashConfirmationError && (<p className="text-xs text-red-600 mt-1">{cashConfirmationError}</p>)} {amountPaid && Number.parseFloat(amountPaid) >= calculateTotal() && ( <div className="bg-green-50 p-2 rounded-md text-center mt-2"> <span className="text-sm text-green-700 block">Cambio</span> <span className="text-xl font-bold text-green-600"> ${(Number.parseFloat(amountPaid) - calculateTotal()).toFixed(2)} </span> </div> )} </div> )} {/* MERCADO PAGO QR */} {paymentMethod === "mercadoPagoQR" && ( <div className="text-center py-3"> {isGeneratingQR && ( <div className="flex flex-col items-center text-gray-500 py-5"><Loader2 className="h-6 w-6 animate-spin mb-2" /><p className="text-sm">Generando QR...</p></div> )} {qrError && ( <div className="p-3 bg-red-100 border border-red-300 rounded text-red-700 text-sm"><p className="font-medium mb-1">Error:</p><p>{qrError}</p><button onClick={generateMercadoPagoQrCode} className="mt-2 text-xs text-blue-600 hover:underline font-medium">Reintentar</button></div> )} {mercadoPagoQrUrl && !isGeneratingQR && !qrError && ( <div className="flex flex-col items-center"><p className="mb-2 text-sm text-gray-600 font-medium">Escanear con App Mercado Pago:</p><img src={mercadoPagoQrUrl} alt="Código QR Mercado Pago" className="w-48 h-48 border-2 border-gray-300 p-0.5" /></div> )} </div> )} </div> <div className="mt-6 flex gap-3"> <button onClick={() => setShowPaymentModal(false)} className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 text-sm font-medium" > Cancelar </button> <button onClick={handleCompletePayment} disabled={ isConfirmingCash || (paymentMethod === 'efectivo' && (!amountPaid || Number.parseFloat(amountPaid) < calculateTotal())) || (paymentMethod === 'mercadoPagoQR' && (isGeneratingQR || !!qrError || !mercadoPagoQrUrl)) } className={`flex-1 px-4 py-2 rounded-md text-white flex items-center justify-center gap-1.5 text-sm font-medium transition ${ isConfirmingCash ? 'bg-yellow-500 cursor-wait' : (paymentMethod === 'efectivo' && (!amountPaid || Number.parseFloat(amountPaid) < calculateTotal())) || (paymentMethod === 'mercadoPagoQR' && (isGeneratingQR || !!qrError || !mercadoPagoQrUrl)) ? 'bg-gray-400 cursor-not-allowed' : 'bg-green-600 hover:bg-green-700' }`} > {isConfirmingCash ? <Loader2 className="h-4 w-4 animate-spin"/> : <CheckCircle className="h-4 w-4" />} <span>{isConfirmingCash ? 'Confirmando...' : (paymentMethod === 'mercadoPagoQR' ? 'Completar (MP)' : 'Completar Venta')}</span> </button> </div>
                </>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

    </div> // Cierre del div principal
  ); // Cierre del return
}; // Cierre del componente

export default PointOfSale;