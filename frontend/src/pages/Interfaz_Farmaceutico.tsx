import React, { useState, useEffect } from "react";
import supabase from '../lib/supabaseClient';
import PointOfSale from '../components/farmaceutico/PointOfSale';
import Fidelizacion from '../components/farmaceutico/Fidelizacion';
import TabNavigation from '../components/farmaceutico/TabNavigation';
import InventoryManagement from '../components/farmaceutico/InventoryManagement';
import Header from '../components/farmaceutico/Header';
import '../App.css';
import '../index.css';
import { useNavigate } from 'react-router-dom';
import SearchMedicines from "../components/farmaceutico/SearchMedicines";

interface FarmaciaData {
  id_farmacia: string;
  nombre: string;
  ubicacion: string;
  horario_atencion: string;
  telefono?: string;
  id_administrador: string;
}

interface CartItem {
  id: string;
  cantidad: number;
  precio_en_pesos: number;
  unidades: number;
  [key: string]: any; // For additional product properties
}

interface Product {
  id: string;
  nombre_medicamento: string;
  precio_en_pesos: number;
  unidades: number;
  [key: string]: any; // For additional product properties
}

interface MedicamentoPorCaducar {
  id: string;
  nombre: string;
  fecha_caducidad: string;
  [key: string]: any;
}

interface MedicamentoSinMovimiento {
  id: string;
  nombre: string;
  ultima_venta: string;
  [key: string]: any;
}

function Interfaz_Farmaceutico() {
    const navigate = useNavigate();
    const [farmaciaData, setFarmaciaData] = useState<FarmaciaData | null>(null);
    const [idFarmaciaDisplay, setIdFarmaciaDisplay] = useState<string>('');
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);
    const [currentDateTime, setCurrentDateTime] = useState<Date>(new Date());
    
    // State for tab navigation
    const [activeTab, setActiveTab] = useState<string>('pos');
    
    // State variables for POS component
    const [cartItems, setCartItems] = useState<CartItem[]>([]);
    const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
    const [productSearch, setProductSearch] = useState<string>('');
    const [productQuantity, setProductQuantity] = useState<number>(1);
    const [clientName, setClientName] = useState<string>('');
    const [clientPhone, setClientPhone] = useState<string>('');
    const [paymentMethod, setPaymentMethod] = useState<string>('efectivo');
    const [showPaymentModal, setShowPaymentModal] = useState<boolean>(false);
    const [amountPaid, setAmountPaid] = useState<string>('');
    const [receiptNumber, setReceiptNumber] = useState<string | null>(null);
    
    // State variables for Inventory Management
    const [medicamentosPorCaducar, setMedicamentosPorCaducar] = useState<MedicamentoPorCaducar[]>([]);
    const [medicamentosSinMovimiento, setMedicamentosSinMovimiento] = useState<MedicamentoSinMovimiento[]>([]);
    const [inventarioSearch, setInventarioSearch] = useState<string>('');
    const [filteredInventario, setFilteredInventario] = useState<any[]>([]);
    const [showAddMedicineModal, setShowAddMedicineModal] = useState<boolean>(false);
    
    // Update current date time every second (with cleanup)
    useEffect(() => {
        const timer = setInterval(() => {
            setCurrentDateTime(new Date());
        }, 1000);
        
        return () => clearInterval(timer);
    }, []);
    
    // Fetch pharmacy data when component mounts
    useEffect(() => {
        const fetchFarmaciaData = async () => {
            try {
                setLoading(true);
                setError(null);
                
                // Get current user
                const { data: { user }, error: userError } = await supabase.auth.getUser();
                if (userError || !user) {
                    throw new Error(userError?.message || "Usuario no autenticado");
                }
                
                // First check if user is a worker
                const { data: workerData, error: workerError } = await supabase
                    .from('trabajadores')
                    .select('id_farmacia')
                    .eq('user_id', user.id)
                    .single();

                let farmaciaData;
                if (!workerError && workerData) {
                    // User is a worker, get pharmacy data using worker's farmacia_id
                    const { data, error: farmaciaError } = await supabase
                        .from('farmacias')
                        .select('*')
                        .eq('id_farmacia', workerData.id_farmacia)
                        .single();
                    farmaciaData = { data, error: farmaciaError };
                } else {
                    // User might be an admin, try getting pharmacy by admin id
                    const { data, error: farmaciaError } = await supabase
                        .from('farmacias')
                        .select('*')
                        .eq('id_administrador', user.id)
                        .single();
                    farmaciaData = { data, error: farmaciaError };
                }

                if (farmaciaData.error || !farmaciaData.data) {
                    throw new Error(farmaciaData.error?.message || "No se encontró farmacia para este usuario");
                }
                
                setFarmaciaData(farmaciaData.data as FarmaciaData);
            } catch (err) {
                console.error('Error fetching farmacia data:', err.message);
                setError(err.message);
                if (err.message.includes("no autenticado")) {
                    navigate('/login');
                }
            } finally {
                setLoading(false);
            }
        };
        
        fetchFarmaciaData();
    }, [navigate]);
    
    // POS handlers
    const handleProductSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
        setProductSearch(e.target.value);
    };
    
    const handleAddToCart = () => {
        if (!selectedProduct) return;
        
        // Validar stock disponible
        if (productQuantity > selectedProduct.unidades) {
            alert(`No hay suficiente stock. Disponible: ${selectedProduct.unidades}`);
            return;
        }
        
        const existingItemIndex = cartItems.findIndex(item => item.id === selectedProduct.id);
        
        if (existingItemIndex >= 0) {
            const updatedItems = [...cartItems];
            updatedItems[existingItemIndex].cantidad += productQuantity;
            setCartItems(updatedItems);
        } else {
            setCartItems([
                ...cartItems,
                {
                    ...selectedProduct,
                    cantidad: productQuantity
                }
            ]);
        }
        
        setSelectedProduct(null);
        setProductQuantity(1);
    };
    
    const handleRemoveFromCart = (itemId: string) => {
        setCartItems(cartItems.filter(item => item.id !== itemId));
    };
    
    const handleUpdateQuantity = (itemId: string, newQuantity: number) => {
        if (newQuantity < 1) return;
        
        const updatedItems = cartItems.map(item => 
            item.id === itemId ? { ...item, cantidad: newQuantity } : item
        );
        
        setCartItems(updatedItems);
    };
    
    const calculateTotal = (): number => {
        return cartItems.reduce((total, item) => total + (item.precio_en_pesos * item.cantidad), 0);
    };
    
    const handleCheckout = () => {
        if (cartItems.length === 0) {
            alert("El carrito está vacío");
            return;
        }
        setShowPaymentModal(true);
    };
    
    const handleCompletePayment = async () => {
        try {
            // Generate receipt number
            const receiptNum = `REC-${Date.now().toString().slice(-6)}`;
            setReceiptNumber(receiptNum);
            
            // Aquí iría la lógica para guardar la venta en Supabase
            // Ejemplo:
            // const { error } = await supabase
            //     .from('ventas')
            //     .insert({ ... });
            // if (error) throw error;
            
            // Limpiar después del pago (simulado)
            setTimeout(() => {
                setCartItems([]);
                setShowPaymentModal(false);
                setReceiptNumber(null);
                setAmountPaid('');
                setClientName('');
                setClientPhone('');
            }, 3000);
            
        } catch (err) {
            console.error('Error procesando pago:', err.message);
            alert("Error al procesar el pago");
        }
    };
    
    // Loading state
    if (loading) return (
        <div className="flex items-center justify-center min-h-screen bg-gray-50">
            <div className="text-center p-6 max-w-md w-full">
                <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-blue-500 border-t-transparent mb-4"></div>
                <h2 className="text-lg font-medium text-gray-900">Cargando información de la farmacia</h2>
                <p className="mt-1 text-gray-600">Por favor espere...</p>
            </div>
        </div>
    );
    
    // Error state
    if (error) return (
        <div className="flex items-center justify-center min-h-screen bg-gray-50">
            <div className="text-center p-6 max-w-md w-full bg-white rounded-lg shadow">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 mx-auto text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <h2 className="text-lg font-medium text-gray-900 mt-4">Acceso Restringido</h2>
                <p className="mt-1 text-gray-600">Para acceder al contenido, necesita iniciar sesión primero.</p>
                <p className="mt-1 text-gray-500 text-sm italic">Si recargaste la página, por seguridad inicia sesión otra vez.</p>
                <button 
                    onClick={() => navigate('/login')}
                    className="mt-4 px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600"
                >
                    Iniciar Sesión
                </button>
            </div>
        </div>
    );
    
    // No pharmacy data state
    if (!farmaciaData) return (
        <div className="flex items-center justify-center min-h-screen bg-gray-50">
            <div className="text-center p-6 max-w-md w-full bg-white rounded-lg shadow">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 mx-auto text-yellow-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <h2 className="text-lg font-medium text-gray-900 mt-4">No se encontró información de farmacia</h2>
                <p className="mt-1 text-gray-600">Necesita configurar una farmacia primero.</p>
                <button 
                    onClick={() => navigate('/setup_farmacia')}
                    className="mt-4 px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600"
                >
                    Configurar Farmacia
                </button>
            </div>
        </div>
    );
    
    return (
        <div className="min-h-screen bg-gray-100">
            {/* Header with current date time */}
            <Header currentDateTime={currentDateTime} pharmacyName={farmaciaData.nombre} />
            
            {/* Header with pharmacy info */}
            <header className="bg-white shadow">
                <div className="max-w-7xl mx-auto py-4 px-4 sm:px-6 lg:px-8">
                    <div className="flex justify-between items-center">
                        <div>
                            <h1 className="text-2xl font-bold text-gray-900">Farmacia: {farmaciaData.nombre}</h1>
                            <div className="mt-1 text-sm text-gray-500">
                                <p>ID Farmacia: {farmaciaData.id_farmacia}</p>
                                <p>Ubicación: {farmaciaData.ubicacion}</p>
                                <p>Horario: {farmaciaData.horario_atencion}</p>
                            </div>
                        </div>
                        
                    </div>
                </div>
            </header>
            
            {/* Main content */}
            <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
                <div className="px-4 py-6 sm:px-0">
                    {/* Tab Navigation */}
                    <TabNavigation activeTab={activeTab} setActiveTab={setActiveTab} />
                    
                    {/* Tab Content */}
                    {activeTab === 'pos' && (
                        <PointOfSale 
                            Id_Far={farmaciaData.id_farmacia}
                            cartItems={cartItems}
                            selectedProduct={selectedProduct}
                            productSearch={productSearch}
                            productQuantity={productQuantity}
                            clientName={clientName}
                            clientPhone={clientPhone}
                            paymentMethod={paymentMethod}
                            showPaymentModal={showPaymentModal}
                            amountPaid={amountPaid}
                            receiptNumber={receiptNumber}
                            handleProductSearch={handleProductSearch}
                            handleAddToCart={handleAddToCart}
                            handleRemoveFromCart={handleRemoveFromCart}
                            handleUpdateQuantity={handleUpdateQuantity}
                            setClientName={setClientName}
                            setClientPhone={setClientPhone}
                            setPaymentMethod={setPaymentMethod}
                            setAmountPaid={setAmountPaid}
                            handleCheckout={handleCheckout}
                            handleCompletePayment={handleCompletePayment}
                            calculateTotal={calculateTotal}
                            setProductQuantity={setProductQuantity}
                        />
                    )}
                    
                    {activeTab === 'fidelizacion' && (
                        <Fidelizacion />
                    )}
                    
                    {activeTab === 'farmaciaInfo' && (
                        <div className="bg-white shadow rounded-lg p-6">
                            <h2 className="text-xl font-semibold mb-4">Información de la Farmacia</h2>
                            <div className="space-y-4">
                                <div>
                                    <h3 className="text-lg font-medium">Detalles Generales</h3>
                                    <p><strong>Nombre:</strong> {farmaciaData.nombre}</p>
                                    <p><strong>Ubicación:</strong> {farmaciaData.ubicacion}</p>
                                    <p><strong>Horario:</strong> {farmaciaData.horario_atencion}</p>
                                    <p><strong>Teléfono:</strong> {farmaciaData.telefono || 'No disponible'}</p>
                                </div>
                            </div>
                        </div>
                    )}
                    
                    {activeTab === 'inventario' && (
                        <InventoryManagement 
                            Id_Far={farmaciaData.id_farmacia}
                            medicamentosPorCaducar={medicamentosPorCaducar}
                            medicamentosSinMovimiento={medicamentosSinMovimiento}
                            filteredInventario={filteredInventario}
                            inventarioSearch={inventarioSearch}
                            setInventarioSearch={setInventarioSearch}
                            setShowAddMedicineModal={setShowAddMedicineModal}
                            setIdFarmaciaDisplay={setIdFarmaciaDisplay}
                        />
                    )}
                </div>
            </main>
        </div>
    );
}

export default Interfaz_Farmaceutico;