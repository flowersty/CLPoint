import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import supabase from "../lib/supabaseClient";
import {
  BarChart2, Plus, Store, AlertCircle, ChevronDown, ChevronUp, Eye, EyeOff, Loader2,
  X // <--- Asegúrate de que X esté aquí
} from "lucide-react";
import FarmaciaForm from "../components/Farmacia/FarmaciaForm";
import FarmaciasList from "../components/Farmacia/FarmaciasList";
import React from "react";

// --- Interfaces (sin cambios) ---
interface Venta { /* ... */ }
interface DailySales { /* ... */ }
interface ItemVenta { /* ... */ }
interface ProductoVendido { /* ... */ }
interface Worker { /* ... */ }
interface Farmacia { /* ... */ }


export default function SetupFarmacia() {
  const navigate = useNavigate();
  const [ventas, setVentas] = useState<Venta[]>([]);
  const [productosPopulares, setProductosPopulares] = useState<ProductoVendido[]>([]);
  const [expandedVenta, setExpandedVenta] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [userData, setUserData] = useState<any>(null);
  const [farmacia, setFarmacia] = useState<Farmacia | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [dailySales, setDailySales] = useState<DailySales[]>([]);
  const [expandedSections, setExpandedSections] = useState({
    productosPopulares: false,
    ultimasVentas: false
  });
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [showPasswords, setShowPasswords] = useState<{[key: string]: boolean}>({});
  const [tempPasswords, setTempPasswords] = useState<{[key: string]: string}>({});

  const [showWorkerForm, setShowWorkerForm] = useState(false);
  const initialWorkerFormData: Worker = {
    nombre: '', telefono: '', email: '', rol: 'farmaceutico', id_farmacia: '',
    cedula_prof: '', especialidad: ''
  };
  const [workerFormData, setWorkerFormData] = useState<Worker>(initialWorkerFormData);
  const [workerFormError, setWorkerFormError] = useState('');
  const [isWorkerSubmitting, setIsWorkerSubmitting] = useState(false);

  // --- Funciones (calculateDailySales, toggleSection, useEffects, analizarProductosPopulares, handleLogout, toggleVenta, handleWorkerSubmit, handleWorkerInputChange) ---
  // ... (Las funciones permanecen igual que en la respuesta anterior) ...
    const toggleSection = (section: 'productosPopulares' | 'ultimasVentas') => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  const calculateDailySales = (ventasData: Venta[]) => {
    const salesByDate = ventasData.reduce((acc: { [key: string]: number }, venta) => {
      // Asegurarse de que monto_total es un número
      const amount = typeof venta.monto_total === 'number' ? venta.monto_total : 0;
      if (!venta.created_at) return acc; // Saltar si no hay fecha
      try {
        const date = new Date(venta.created_at).toLocaleDateString('es-MX'); // O el locale adecuado
         acc[date] = (acc[date] || 0) + amount;
      } catch (e) {
          console.error("Fecha inválida en venta:", venta.created_at, venta.id);
      }
      return acc;
    }, {});

    return Object.entries(salesByDate)
        .map(([date, total]) => ({ date, total }))
        .sort((a, b) => new Date(b.date.split('/').reverse().join('-')).getTime() - new Date(a.date.split('/').reverse().join('-')).getTime()); // Ordenar por fecha descendente
};


  // useEffect para calcular ventas diarias (sin cambios)
  useEffect(() => {
    if (ventas.length > 0) {
        setDailySales(calculateDailySales(ventas));
    } else {
        setDailySales([]); // Limpiar si no hay ventas
    }
  }, [ventas]); // Solo depende de ventas


  // *** useEffect PRINCIPAL: Auth check y carga de Farmacia ***
  useEffect(() => {
    let isMounted = true; // Flag para evitar actualizaciones en componente desmontado
    setLoading(true); // Inicia carga

    const checkAuthAndLoadFarmacia = async () => {
      try {
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();

        if (sessionError) throw sessionError;

        if (!session?.user) {
          console.log("No session found, redirecting to login.");
          if (isMounted) navigate("/login");
          return;
        }

        // console.log("Session found, user:", session.user.id);
        if (isMounted) setUserData(session.user); // Guardar datos del usuario

        // Buscar farmacia asociada al ID del administrador (user.id)
        const { data: farmaciaData, error: farmaciaError } = await supabase
          .from('farmacias')
          .select('*')
          .eq('id_administrador', session.user.id)
          .single(); // Esperamos solo una o ninguna

        if (farmaciaError && farmaciaError.code !== 'PGRST116') { // Ignorar error "No rows found"
          throw farmaciaError;
        }

        // console.log("Farmacia data fetched:", farmaciaData);
        if (isMounted) {
            setFarmacia(farmaciaData || null); // Establecer farmacia (o null si no existe)
             // Si no hay farmacia, no mostramos el formulario aquí, se maneja en el render
            setShowForm(!farmaciaData);
        }

      } catch (error) {
        console.error("Error checking auth or loading farmacia:", error);
        // Podrías redirigir a login o mostrar un error general si falla la sesión/carga inicial
        if (isMounted) {
            // Manejo de errores más específico si es necesario
            // setFarmacia(null); // Asegurarse de que farmacia es null en caso de error
            // navigate("/login"); // Opcional: redirigir en caso de error grave
        }
      } finally {
        // console.log("Finished initial auth and farmacia load.");
        if (isMounted) setLoading(false); // Finaliza carga solo si está montado
      }
    };

    checkAuthAndLoadFarmacia();

    // Función de limpieza para evitar actualizaciones de estado si el componente se desmonta
    return () => {
      isMounted = false;
      // console.log("SetupFarmacia unmounted or effect re-running.");
    };
    // Dependencias: `navigate` es estable. Este efecto SÓLO debe correr al montar.
  }, [navigate]);


  // *** useEffect SECUNDARIO: Carga de Ventas y Productos Populares (depende de farmacia.id_farmacia) ***
  useEffect(() => {
      let isMounted = true;
      if (farmacia?.id_farmacia) {
          // console.log("Farmacia ID exists, fetching ventas...");
          const loadVentas = async () => {
              try {
                  // Ajusta la consulta si las ventas se relacionan directamente con id_farmacia
                  const { data: ventasData, error: ventasError } = await supabase
                      .from('ventas')
                      // Asegúrate que 'id_farmacia' exista en tu tabla 'ventas' o ajusta la consulta
                      // .eq('id_farmacia', farmacia.id_farmacia)
                      .select('*')
                      .order('created_at', { ascending: false })
                      .limit(20); // Limitar número de ventas iniciales

                  if(ventasError) throw ventasError;

                  // console.log("Ventas fetched: ", ventasData?.length);
                  if (isMounted) {
                      const validVentas = ventasData || [];
                      setVentas(validVentas);
                      if (validVentas.length > 0) {
                          analizarProductosPopulares(validVentas);
                      } else {
                          setProductosPopulares([]); // Limpiar si no hay ventas
                      }
                  }
              } catch(error) {
                  console.error("Error loading ventas:", error);
                  if(isMounted) {
                      setVentas([]); // Limpiar ventas en caso de error
                      setProductosPopulares([]);
                  }
              }
          };
          loadVentas();
      } else {
          // Si no hay farmacia ID, limpiar ventas y productos
          // console.log("No Farmacia ID, clearing ventas.");
          if (isMounted) {
              setVentas([]);
              setProductosPopulares([]);
          }
      }
      return () => { isMounted = false };
  // Depende explícitamente del ID de la farmacia. Si farmacia cambia a null, esto se re-evaluará.
  }, [farmacia?.id_farmacia]);


  // *** useEffect TERCERO: Carga de Trabajadores (depende de farmacia.id_farmacia) ***
  useEffect(() => {
      let isMounted = true;
      if (farmacia?.id_farmacia) {
          // console.log("Farmacia ID exists, fetching workers...");
          const loadWorkers = async () => {
              try {
                  const { data: workersData, error: workersError } = await supabase
                      .from('trabajadores')
                      .select('*')
                      .eq('id_farmacia', farmacia.id_farmacia);

                  if (workersError) throw workersError;

                  // console.log("Workers fetched:", workersData?.length);
                  if (isMounted) setWorkers(workersData || []);

              } catch (error) {
                  console.error("Error loading workers:", error);
                  if (isMounted) setWorkers([]); // Limpiar en caso de error
              }
          };
          loadWorkers();
      } else {
          // Si no hay farmacia ID, limpiar trabajadores
           // console.log("No Farmacia ID, clearing workers.");
           if (isMounted) setWorkers([]);
      }
      return () => { isMounted = false };
   // Depende explícitamente del ID de la farmacia.
  }, [farmacia?.id_farmacia]);


  // --- Otras Funciones ---

  const analizarProductosPopulares = (ventasData: Venta[]) => {
    const productosMap = new Map<string, ProductoVendido>();

    ventasData.forEach(venta => {
      // Verificar que items_json sea un array y no esté vacío
      if (venta.items_json && Array.isArray(venta.items_json) && venta.items_json.length > 0) {
        venta.items_json.forEach((item: ItemVenta) => {
          // Validar que los datos necesarios existan y sean números
          const { upc, nombre_medicamento, cantidad, precio_en_pesos } = item;
          const qty = typeof cantidad === 'number' ? cantidad : 0;
          const price = typeof precio_en_pesos === 'number' ? precio_en_pesos : 0;

          if (!upc || !nombre_medicamento || qty <= 0) {
             // console.warn("Item inválido o sin cantidad en venta:", venta.id, item);
             return; // Saltar item inválido
          }

          const unidadesTotales = qty; // Ya es la cantidad vendida en esa transacción

          if (productosMap.has(upc)) {
            const producto = productosMap.get(upc)!;
            producto.unidadesTotales += unidadesTotales;
            producto.ventasTotales += price * qty;
          } else {
            productosMap.set(upc, {
              upc,
              nombre: nombre_medicamento,
              unidadesTotales,
              ventasTotales: price * qty
            });
          }
        });
      }
    });

    const productosArray = Array.from(productosMap.values());
    productosArray.sort((a, b) => b.unidadesTotales - a.unidadesTotales); // Ordenar por unidades vendidas

    setProductosPopulares(productosArray);
  };

  const handleLogout = async () => {
    setLoading(true); // Opcional: mostrar indicador de carga
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error("Error signing out:", error);
      // Manejar error si es necesario
    }
    // No es necesario limpiar estado aquí, la navegación desmontará el componente
    navigate("/login");
  };

  const toggleVenta = (id: number) => {
    setExpandedVenta(expandedVenta === id ? null : id);
  };

  // Worker form handlers
  const handleWorkerSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setWorkerFormError('');
    setIsWorkerSubmitting(true); // Iniciar estado de envío

    // Validaciones
    if (!workerFormData.nombre || !workerFormData.email || !workerFormData.telefono || !workerFormData.rol) {
      setWorkerFormError('Por favor complete nombre, email, teléfono y rol.');
      setIsWorkerSubmitting(false);
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(workerFormData.email)) {
      setWorkerFormError('Por favor ingrese un correo electrónico válido.');
      setIsWorkerSubmitting(false);
      return;
    }
    if (workerFormData.rol === 'doctor' && (!workerFormData.especialidad || !workerFormData.cedula_prof)) {
      setWorkerFormError('La especialidad y cédula profesional son requeridas para doctores.');
      setIsWorkerSubmitting(false);
      return;
    }
    // Asegurarse de tener id_farmacia
    if (!farmacia?.id_farmacia) {
        setWorkerFormError('Error interno: No se pudo obtener el ID de la farmacia.');
        setIsWorkerSubmitting(false);
        return;
    }

    try {
      // Generar contraseña temporal segura
      const tempPassword = Math.random().toString(36).slice(-10); // Más larga

      // 1. Crear usuario en Supabase Auth
      // console.log("Attempting to sign up worker:", workerFormData.email);
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: workerFormData.email,
        password: tempPassword,
        options: {
          data: { // Metadata adicional si tu RLS la usa
            role: workerFormData.rol,
            // Podrías añadir nombre aquí si quieres, aunque ya estará en la tabla trabajadores
            // full_name: workerFormData.nombre
          },
          // Opcional: Deshabilitar email de confirmación si no lo necesitas
          // emailRedirectTo: window.location.origin // O a donde quieras redirigir tras confirmación
        }
      });

      if (authError) {
        console.error("Auth SignUp Error:", authError);
        // Mapear errores comunes
        if (authError.message.includes("User already registered")) {
            setWorkerFormError("Este correo electrónico ya está registrado.");
        } else if (authError.message.includes("Password should be at least 6 characters")) {
             setWorkerFormError("Error interno: La contraseña generada es inválida."); // No debería pasar
        }
        else {
            setWorkerFormError(`Error de autenticación: ${authError.message}`);
        }
        throw authError; // Detener ejecución
      }

       if (!authData.user) {
           throw new Error("Usuario no creado en Supabase Auth a pesar de no haber error.");
       }

      // console.log("Auth user created:", authData.user.id);

      // 2. Crear registro en la tabla 'trabajadores'
      // Asegurarnos que solo los campos definidos en la interfaz Worker (y en la tabla) se envíen
      const workerPayload: Partial<Worker> & { user_id: string; id_farmacia: string; created_at: string } = {
          nombre: workerFormData.nombre,
          telefono: workerFormData.telefono,
          email: workerFormData.email,
          rol: workerFormData.rol,
          cedula_prof: workerFormData.rol === 'doctor' ? workerFormData.cedula_prof || null : null, // Null si no es doctor
          especialidad: workerFormData.rol === 'doctor' ? workerFormData.especialidad || null : null, // Null si no es doctor
          key_lux: workerFormData.key_lux || null, // Opcional
          // Campos obligatorios para la inserción
          user_id: authData.user.id, // Vincular con el usuario de Auth
          id_farmacia: farmacia.id_farmacia, // Usar el ID de la farmacia actual
          created_at: new Date().toISOString() // Añadir timestamp
      };


      // console.log("Inserting worker into DB:", workerPayload);

      const { data: insertedWorker, error: workerError } = await supabase
        .from('trabajadores')
        .insert(workerPayload)
        .select() // Pedir que devuelva el registro insertado
        .single(); // Esperamos que inserte solo uno


      if (workerError) {
        console.error("Worker Insert Error:", workerError);
        // Intentar limpiar el usuario de Auth si falla la inserción en DB (complejo, requiere funciones admin)
        // Por ahora, solo mostrar error
        setWorkerFormError(`Error al guardar datos del trabajador: ${workerError.message}`);
        // Podrías intentar eliminar el usuario de Auth aquí si tienes permisos de admin
        // await supabase.auth.admin.deleteUser(authData.user.id); // ¡REQUIERE LLAMADA A EDGE FUNCTION O BACKEND!
        throw workerError;
      }

      // console.log("Worker inserted successfully:", insertedWorker);

      // 3. Éxito: Actualizar UI
      setTempPasswords(prev => ({
        ...prev,
        [authData.user!.id]: tempPassword // Guardar contraseña temporal para mostrarla
      }));

       // Añadir el trabajador devuelto por Supabase (con su ID real) a la lista local
       if (insertedWorker) {
           setWorkers(prevWorkers => [...prevWorkers, insertedWorker as Worker]);
       } else {
           // Como fallback si Supabase no devuelve el worker, añadir con datos locales
            console.warn("Supabase no devolvió el worker insertado, añadiendo con datos locales.");
            setWorkers(prevWorkers => [...prevWorkers, { ...workerPayload, id: `temp-${Date.now()}` } as Worker]);
       }


      setShowWorkerForm(false); // Cerrar modal
      setWorkerFormData(initialWorkerFormData); // Resetear formulario

    } catch (error) {
      // El error específico ya debería estar en workerFormError por los bloques catch anteriores
      console.error('Error general en handleWorkerSubmit:', error);
       if (!workerFormError) { // Si no se estableció un error específico antes
           setWorkerFormError('Ocurrió un error inesperado al registrar el trabajador.');
       }
    } finally {
      setIsWorkerSubmitting(false); // Finalizar estado de envío
    }
  };


  const handleWorkerInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setWorkerFormData(prev => ({ ...prev, [name]: value }));
  };


  // --- Renderizado ---

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Cargando datos...</p>
        </div>
      </div>
    );
  }

  // Si después de cargar, no hay farmacia, mostrar configuración o formulario
  if (!farmacia) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-4xl mx-auto">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between mb-6">
              <h1 className="text-2xl font-bold text-gray-900">Configuración de Farmacia</h1>
              <button
                onClick={handleLogout}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
              >
                Cerrar Sesión
              </button>
            </div>

             {/* Usar el componente FarmaciaForm directamente */}
             <FarmaciaForm
                onFarmaciaSaved={(nuevaFarmacia) => {
                    console.log("Farmacia guardada desde Form:", nuevaFarmacia);
                    // Asegúrate de que nuevaFarmacia tenga el formato correcto de la interfaz Farmacia
                    setFarmacia(nuevaFarmacia); // Actualiza el estado con la nueva farmacia
                    setShowForm(false); // Oculta el formulario si estaba visible explícitamente
                }}
                // Podrías pasarle el user ID si el formulario lo necesita internamente
                adminUserId={userData?.id}
             />

          </div>
        </div>
      </div>
    );
  }

   // --- Renderizado del Dashboard Principal (si hay farmacia) ---
   return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Card Principal de la Farmacia Actual */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
           <div className="flex flex-wrap items-center justify-between mb-6 gap-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{farmacia.nombre}</h1>
              <p className="text-sm text-gray-600">ID: {farmacia.id_farmacia}</p>
              {farmacia.ubicacion && <p className="text-sm text-gray-500 mt-1">Ubicación: {farmacia.ubicacion}</p>}
              {farmacia.telefono && <p className="text-sm text-gray-500">Tel: {farmacia.telefono}</p>}
            </div>
            <button
              onClick={handleLogout}
              className="px-4 py-2 text-sm font-medium text-red-600 hover:text-red-800 bg-red-100 rounded-md transition"
            >
              Cerrar Sesión
            </button>
          </div>

           {/* Grid para secciones de datos */}
           <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {/* Ventas Diarias */}
              <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                  <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center text-emerald-700">
                      <BarChart2 className="w-5 h-5 mr-2" />
                      <h2 className="text-lg font-semibold">Ventas Diarias</h2>
                      </div>
                  </div>
                  <div className="space-y-3 max-h-60 overflow-y-auto pr-2">
                      {dailySales.length > 0 ? dailySales.map((sale, index) => (
                      <div key={index} className="bg-white p-3 rounded shadow-sm border border-gray-100">
                          <div className="flex justify-between items-center text-sm">
                          <p className="font-medium text-gray-700">{sale.date}</p>
                          <p className="text-emerald-600 font-semibold">${sale.total.toFixed(2)}</p>
                          </div>
                      </div>
                      )) : (
                          <p className="text-sm text-gray-500 text-center py-4">No hay datos de ventas diarias.</p>
                      )}
                  </div>
              </div>

              {/* Productos Más Vendidos */}
              <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                  <div
                      className="flex items-center justify-between mb-3 cursor-pointer"
                      onClick={() => toggleSection('productosPopulares')}
                  >
                      <div className="flex items-center text-blue-700">
                          <BarChart2 className="w-5 h-5 mr-2" />
                          <h2 className="text-lg font-semibold">Productos Populares</h2>
                      </div>
                      {expandedSections.productosPopulares ? <ChevronUp className="w-5 h-5 text-gray-500" /> : <ChevronDown className="w-5 h-5 text-gray-500" />}
                  </div>
                  <div className={`transition-all duration-300 ease-in-out overflow-hidden ${expandedSections.productosPopulares ? 'max-h-[500px] opacity-100' : 'max-h-0 opacity-0'}`}>
                      <div className="space-y-3 pt-2 max-h-60 overflow-y-auto pr-2">
                          {productosPopulares.length > 0 ? productosPopulares.slice(0, 7).map((producto) => (
                          <div key={producto.upc} className="bg-white p-3 rounded shadow-sm border border-gray-100 text-sm">
                              <h3 className="font-medium text-gray-800 truncate" title={producto.nombre}>{producto.nombre}</h3>
                              <div className="flex justify-between mt-1 text-gray-600">
                                  <span>Unidades: {producto.unidadesTotales}</span>
                                  <span className="font-medium">Total: ${producto.ventasTotales.toFixed(2)}</span>
                              </div>
                          </div>
                          )) : (
                              <p className="text-sm text-gray-500 text-center py-4">No hay datos de productos populares.</p>
                          )}
                      </div>
                  </div>
              </div>

              {/* Últimas Ventas */}
              <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 md:col-span-2 lg:col-span-1">
                  <div
                      className="flex items-center justify-between mb-3 cursor-pointer"
                      onClick={() => toggleSection('ultimasVentas')}
                  >
                      <div className="flex items-center text-purple-700">
                          <Store className="w-5 h-5 mr-2" />
                          <h2 className="text-lg font-semibold">Últimas Ventas</h2>
                      </div>
                      {expandedSections.ultimasVentas ? <ChevronUp className="w-5 h-5 text-gray-500" /> : <ChevronDown className="w-5 h-5 text-gray-500" />}
                  </div>
                  <div className={`transition-all duration-300 ease-in-out overflow-hidden ${expandedSections.ultimasVentas ? 'max-h-[500px] opacity-100' : 'max-h-0 opacity-0'}`}>
                      <div className="space-y-3 pt-2 max-h-60 overflow-y-auto pr-2">
                          {ventas.length > 0 ? ventas.map((venta) => (
                          <div key={venta.id} className="bg-white p-3 rounded shadow-sm border border-gray-100">
                              <div
                                  className="flex items-center justify-between cursor-pointer text-sm"
                                  onClick={() => toggleVenta(venta.id)}
                              >
                                  <div>
                                      <p className="font-medium text-gray-800">
                                      Venta #{venta.id} - ${typeof venta.monto_total === 'number' ? venta.monto_total.toFixed(2) : 'N/A'}
                                      </p>
                                      <p className="text-xs text-gray-500">
                                      {venta.created_at ? new Date(venta.created_at).toLocaleString('es-MX') : 'Fecha inválida'}
                                      </p>
                                  </div>
                                  {expandedVenta === venta.id ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                              </div>
                              {expandedVenta === venta.id && (
                                  <div className="mt-3 pt-3 border-t border-gray-100 text-xs space-y-1">
                                      <p className="text-gray-600">Estado: <span className="font-medium">{venta.estado || 'N/A'}</span></p>
                                      <p className="text-gray-600">Método Pago: <span className="font-medium">{venta.metodo_pago_solicitado || 'N/A'}</span></p>
                                      {venta.items_json && Array.isArray(venta.items_json) && venta.items_json.length > 0 && (
                                          <div className="pt-1">
                                              <p className="font-medium mb-1 text-gray-700">Productos:</p>
                                              <ul className="list-disc list-inside pl-2 space-y-1">
                                                  {venta.items_json.map((item: ItemVenta, index: number) => (
                                                      <li key={index} className="text-gray-600">
                                                          {item.nombre_medicamento || 'Producto Desconocido'}: {item.cantidad || 0} x ${typeof item.precio_en_pesos === 'number' ? item.precio_en_pesos.toFixed(2) : 'N/A'} = <span className="font-medium">${((item.cantidad || 0) * (item.precio_en_pesos || 0)).toFixed(2)}</span>
                                                      </li>
                                                  ))}
                                              </ul>
                                          </div>
                                      )}
                                  </div>
                              )}
                          </div>
                          )) : (
                              <p className="text-sm text-gray-500 text-center py-4">No hay ventas recientes registradas.</p>
                          )}
                      </div>
                  </div>
              </div>
            </div> {/* Fin del grid de datos */}
          </div> {/* Fin Card Principal */}

          {/* Sección Gestión de Trabajadores */}
          <div className="mt-6 bg-white rounded-lg shadow p-6">
            <div className="flex flex-wrap justify-between items-center mb-6 gap-4">
              <h2 className="text-xl font-semibold text-gray-800">Gestión de Trabajadores</h2>
              <button
                onClick={() => {
                    setWorkerFormData(initialWorkerFormData);
                    setWorkerFormError('');
                    setShowWorkerForm(true);
                }}
                className="px-4 py-2 bg-emerald-600 text-white rounded-md hover:bg-emerald-700 transition-colors flex items-center text-sm font-medium"
              >
                <Plus className="w-4 h-4 mr-1.5" />
                Agregar Trabajador
              </button>
            </div>

            {/* Workers List */}
            <div className="mt-4 space-y-3">
               {workers.length > 0 ? workers.map((worker) => (
                <div key={worker.id || worker.user_id} className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                  <div className="flex flex-wrap justify-between items-start gap-4">
                    <div className="flex-1 min-w-[200px]">
                      <h3 className="font-medium text-base text-gray-800">{worker.nombre}</h3>
                      <p className="text-sm text-gray-600">{worker.email}</p>
                      <p className="text-xs text-gray-500 mt-0.5">Tel: {worker.telefono}</p>
                      <span className={`mt-1 inline-block px-2 py-0.5 rounded text-xs font-medium ${worker.rol === 'doctor' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'}`}>
                          {worker.rol === 'doctor' ? 'Doctor' : 'Farmacéutico'}
                      </span>
                       {worker.rol === 'doctor' && (
                          <div className="text-xs text-gray-500 mt-1">
                              <p>Cédula: {worker.cedula_prof || 'N/A'}</p>
                              <p>Especialidad: {worker.especialidad || 'N/A'}</p>
                          </div>
                      )}
                    </div>
                    {worker.user_id && tempPasswords[worker.user_id] && (
                      <div className="relative flex-shrink-0">
                        <label className="block text-xs font-medium text-gray-500 mb-1">Contraseña Temporal:</label>
                        <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded border border-gray-300 shadow-sm">
                          <span className="text-sm font-mono">
                            {showPasswords[worker.user_id] ? tempPasswords[worker.user_id] : '••••••••••'}
                          </span>
                          <button
                            onClick={() => setShowPasswords(prev => ({
                              ...prev,
                              [worker.user_id!]: !prev[worker.user_id!]
                            }))}
                            className="text-gray-400 hover:text-gray-600"
                            title={showPasswords[worker.user_id!] ? "Ocultar" : "Mostrar"}
                          >
                            {showPasswords[worker.user_id!] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        </div>
                        <p className="text-[10px] text-red-600 mt-1 text-center font-medium">¡Guardar y compartir!</p>
                      </div>
                    )}
                  </div>
                </div>
              )) : (
                   <p className="text-sm text-gray-500 text-center py-4">No hay trabajadores registrados para esta farmacia.</p>
              )}
            </div>

            {/* --- Modal Formulario Worker --- */}
            {showWorkerForm && (
              <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
                <div className="bg-white rounded-xl p-6 max-w-md w-full shadow-xl m-4 max-h-[90vh] overflow-y-auto">
                  <div className="flex justify-between items-center mb-4">
                      <h3 className="text-lg font-semibold text-gray-800">Agregar Nuevo Trabajador</h3>
                      {/* Botón de cierre AHORA usa el icono X importado */}
                      <button onClick={() => setShowWorkerForm(false)} className="text-gray-400 hover:text-gray-600">
                          <X className="h-5 w-5" />
                      </button>
                  </div>

                  <form onSubmit={handleWorkerSubmit} className="space-y-4">
                      <div>
                          <label htmlFor="nombre_worker" className="block text-sm font-medium text-gray-700 mb-1">Nombre Completo</label>
                          <input type="text" name="nombre" id="nombre_worker" value={workerFormData.nombre} onChange={handleWorkerInputChange} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-emerald-500 focus:border-emerald-500 sm:text-sm" required />
                      </div>
                      <div>
                          <label htmlFor="email_worker" className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                          <input type="email" name="email" id="email_worker" value={workerFormData.email} onChange={handleWorkerInputChange} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-emerald-500 focus:border-emerald-500 sm:text-sm" required />
                      </div>
                      <div>
                          <label htmlFor="telefono_worker" className="block text-sm font-medium text-gray-700 mb-1">Teléfono</label>
                          <input type="tel" name="telefono" id="telefono_worker" value={workerFormData.telefono} onChange={handleWorkerInputChange} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-emerald-500 focus:border-emerald-500 sm:text-sm" required />
                      </div>
                      <div>
                          <label htmlFor="rol_worker" className="block text-sm font-medium text-gray-700 mb-1">Rol</label>
                          <select name="rol" id="rol_worker" value={workerFormData.rol} onChange={handleWorkerInputChange} className="mt-1 block w-full px-3 py-2 border border-gray-300 bg-white rounded-md shadow-sm focus:outline-none focus:ring-emerald-500 focus:border-emerald-500 sm:text-sm" >
                              <option value="farmaceutico">Farmacéutico</option>
                              <option value="doctor">Doctor</option>
                          </select>
                      </div>
                      {workerFormData.rol === 'doctor' && (
                          <>
                              <div>
                                  <label htmlFor="cedula_prof_worker" className="block text-sm font-medium text-gray-700 mb-1">Cédula Profesional</label>
                                  <input type="text" name="cedula_prof" id="cedula_prof_worker" value={workerFormData.cedula_prof || ''} onChange={handleWorkerInputChange} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-emerald-500 focus:border-emerald-500 sm:text-sm" required />
                              </div>
                              <div>
                                  <label htmlFor="especialidad_worker" className="block text-sm font-medium text-gray-700 mb-1">Especialidad</label>
                                  <input type="text" name="especialidad" id="especialidad_worker" value={workerFormData.especialidad || ''} onChange={handleWorkerInputChange} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-emerald-500 focus:border-emerald-500 sm:text-sm" required />
                              </div>
                          </>
                      )}
                      {workerFormError && (
                          <p className="text-red-600 text-sm font-medium p-2 bg-red-50 rounded border border-red-200 flex items-center gap-1.5">
                              <AlertCircle className="w-4 h-4"/> {workerFormError}
                          </p>
                      )}
                      <div className="flex justify-end gap-3 pt-4">
                          <button type="button" onClick={() => setShowWorkerForm(false)} disabled={isWorkerSubmitting} className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition disabled:opacity-50" > Cancelar </button>
                          <button type="submit" disabled={isWorkerSubmitting} className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-md hover:bg-emerald-700 transition flex items-center justify-center disabled:opacity-50 disabled:cursor-wait" >
                              {isWorkerSubmitting ? (<><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Guardando...</>) : ('Guardar Trabajador')}
                          </button>
                      </div>
                  </form>
                </div>
              </div>
            )}
            {/* --- Fin Modal Formulario Worker --- */}
          </div> {/* Fin Sección Gestión de Trabajadores */}
        </div> {/* Fin max-w-7xl */}
      </div> /* Fin Contenedor Principal */
    );
}