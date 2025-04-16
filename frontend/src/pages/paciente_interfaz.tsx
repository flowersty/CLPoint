import { useState, useEffect } from 'react';
import { 
  Home,
  Calendar as CalendarIcon,
  Package2,
  FileText,
  Clock,
  Search,
  Sunrise,
  CloudRain,
  QrCode
} from 'lucide-react';
import QRCode from 'qrcode';
import Barcode from 'react-barcode';

import Header from '../components/paciente/Header';
import ContentPanel from '../components/paciente/ContentPanel';
import supabase from '../lib/supabaseClient';
import ToastProvider from '../components/providers/ToastProvider';

const Paciente_Interfaz: React.FC = () => {
  const [currentView, setCurrentView] = useState<string>('home');
  const [patientData, setPatientData] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [loyaltyCode, setLoyaltyCode] = useState<string>('');
  const [showQR, setShowQR] = useState<boolean>(false);
  const [showBarcode, setShowBarcode] = useState<boolean>(false);
  const [isGeneratingCode, setIsGeneratingCode] = useState<boolean>(false);

  const generateLoyaltyCode = async () => {
    setIsGeneratingCode(true);
    try {
      const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
      const codeLength = 12;
      let result = '';
      for (let i = 0; i < codeLength; i++) {
        result += characters.charAt(Math.floor(Math.random() * characters.length));
      }
      setLoyaltyCode(result);
    
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
    
      const { error } = await supabase
        .from('patients')
        .update({ surecode: result })
        .eq('user_id', user.id);
    
      if (error) throw error;
    } catch (error) {
      console.error('Error updating loyalty code:', error);
      alert('Error al generar el código de fidelización');
    } finally {
      setIsGeneratingCode(false);
    }
  };

  useEffect(() => {
    fetchPatientData();
  }, []);

  const fetchPatientData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('patients')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (error) throw error;

      setPatientData(data);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching patient data:', error);
      setLoading(false);
    }
  };

  const [weatherData, setWeatherData] = useState({
    temp: 0,
    condition: '',
    location: '',
    day: ''
  });

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(async (position) => {
        const { latitude, longitude } = position.coords;
        try {
          const response = await fetch(
            `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,weather_code&timezone=auto`
          );
          if (!response.ok) {
            throw new Error(`Weather API responded with status: ${response.status}`);
          }
          const data = await response.json();
          
          // Weather code mapping for conditions
          const getWeatherCondition = (code) => {
            const conditions = {
              0: 'Despejado',
              1: 'Mayormente despejado',
              2: 'Parcialmente nublado',
              3: 'Nublado',
              45: 'Neblina',
              48: 'Niebla',
              51: 'Llovizna ligera',
              53: 'Llovizna moderada',
              55: 'Llovizna intensa',
              61: 'Lluvia ligera',
              63: 'Lluvia moderada',
              65: 'Lluvia intensa',
              80: 'Lluvia ocasional',
              95: 'Tormenta'
            };
            return conditions[code] || 'No disponible';
          };

          if (data && data.current) {
            setWeatherData({
              temp: Math.round(data.current.temperature_2m),
              condition: getWeatherCondition(data.current.weather_code),
              location: 'Tu ubicación',
              day: new Date().toLocaleDateString('es-ES', { weekday: 'long' })
            });
          }
        } catch (error) {
          console.error('Error fetching weather data:', error);
          setWeatherData(prev => ({
            ...prev,
            temp: '--',
            condition: 'No disponible',
            location: 'Error',
            day: new Date().toLocaleDateString('es-ES', { weekday: 'long' })
          }));
        }
      });
    }
  }, []);

  const [healthOverview] = useState({
    nextAppointment: {
      date: patientData?.proxima_consulta ? new Date(patientData.proxima_consulta).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }) : 'No programada',
      time: '14:30',
      tipo_de_cita: '_'
    },
    medicationDue: {
      count: 2,
      nextTime: 'Hoy a las 19:00'
    },
    weather: {
      temp: 26,
      condition: 'Lluvia',
      location: 'CDMX',
      day: 'Martes'
    }
  });

  const handleViewChange = (view: string) => {
    setCurrentView(view);
  };

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <ToastProvider />
      <Header patientName={patientData?.nombre_completo || patientData?.name} />
      
      <main className="flex-1 py-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left Sidebar - Navigation */}
            <div className="lg:col-span-2 bg-white rounded-xl shadow-md border-r border-gray-100">
              <div className="sticky top-24 p-4 space-y-2">
                <button 
                  className={`w-full flex items-center space-x-3 p-3 ${currentView === 'home' ? 'bg-primary/10 text-primary' : 'text-gray-700 hover:bg-gray-100'} rounded-xl`}
                  onClick={() => handleViewChange('home')}
                >
                  <Home className="h-5 w-5" />
                  <span className={currentView === 'home' ? "font-medium" : ""}>Inicio</span>
                </button>
                
                <button 
                  className={`w-full flex items-center space-x-3 p-3 ${currentView === 'appointments' ? 'bg-primary/10 text-primary' : 'text-gray-700 hover:bg-gray-100'} rounded-xl`}
                  onClick={() => handleViewChange('appointments')}
                >
                  <CalendarIcon className="h-5 w-5" />
                  <span className={currentView === 'appointments' ? "font-medium" : ""}>Calendario</span>
                </button>
                
                <button 
                  className={`w-full flex items-center space-x-3 p-3 ${currentView === 'medications' ? 'bg-primary/10 text-primary' : 'text-gray-700 hover:bg-gray-100'} rounded-xl`}
                  onClick={() => handleViewChange('medications')}
                >
                  <FileText className="h-5 w-5" />
                  <span className={currentView === 'medications' ? "font-medium" : ""}>Recetas</span>
                </button>
                
                <button 
                  className={`w-full flex items-center space-x-3 p-3 ${currentView === 'pharmacies' ? 'bg-primary/10 text-primary' : 'text-gray-700 hover:bg-gray-100'} rounded-xl`}
                  onClick={() => handleViewChange('pharmacies')}
                >
                  <Package2 className="h-5 w-5" />
                  <span className={currentView === 'pharmacies' ? "font-medium" : ""}>Farmacias</span>
                </button>

                <button 
                  className={`w-full flex items-center space-x-3 p-3 ${currentView === 'profile' ? 'bg-primary/10 text-primary' : 'text-gray-700 hover:bg-gray-100'} rounded-xl`}
                  onClick={() => handleViewChange('profile')}
                >
                  <QrCode className="h-5 w-5" />
                  <span className={currentView === 'profile' ? "font-medium" : ""}>Perfil</span>
                </button>
              </div>
            </div>
          
            {/* Main Content Area */}
            <div className="lg:col-span-10 space-y-6">
              {/* Top Cards Row - Solo visible en home */}
              {currentView === 'home' && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-white rounded-xl shadow-md p-5" style={{borderTop: '4px solid var(--color-primary)'}}>
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="text-sm text-gray-500 font-medium">Buenos días</p>
                        <h2 className="text-xl font-bold text-gray-800 font-inter">
                          {patientData?.nombre_completo || patientData?.name || 'Paciente'}
                        </h2>
                        <p className="text-xs text-gray-500 mt-1 flex items-center">
                          <Clock className="h-3 w-3 mr-1" />
                          {new Date().toLocaleTimeString('es-ES', {hour: '2-digit', minute:'2-digit'})}
                        </p>
                      </div>
                      <div className="h-10 w-10 bg-gradient-to-br from-primary to-primary/80 rounded-full flex items-center justify-center">
                        <Sunrise className="h-5 w-5 text-white" />
                      </div>
                    </div>
                  </div>
                  
                  <div 
                    className="bg-white rounded-xl shadow-md p-5 cursor-pointer"
                    onClick={() => handleViewChange('appointments')}
                    style={{borderTop: '4px solid var(--color-accent)'}}>
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="text-sm text-gray-500 font-medium">Próxima cita</p>
                        <h2 className="text-xl font-bold text-gray-800 font-inter">
                          {patientData?.proxima_consulta ? new Date(patientData.proxima_consulta).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }) : 'No programada'}
                        </h2>
                        <p className="text-xs text-gray-500 mt-1">
                          {healthOverview.nextAppointment.time} - {healthOverview.nextAppointment.doctor}
                        </p>
                      </div>
                      <div className="h-10 w-10 bg-gradient-to-br from-accent to-accent/80 rounded-full flex items-center justify-center">
                        <CalendarIcon className="h-5 w-5 text-white" />
                      </div>
                    </div>
                  </div>
                  
                  <div className="bg-white rounded-xl shadow-md p-5" style={{borderTop: '4px solid var(--color-accent)'}}>
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="text-sm text-gray-500 font-medium">{weatherData.day}</p>
                        <h2 className="text-xl font-bold text-gray-800 font-inter">
                          {weatherData.temp}°
                        </h2>
                        <p className="text-xs text-gray-500 mt-1">
                          {weatherData.condition} • {weatherData.location}
                        </p>
                      </div>
                      <div className="h-10 w-10 bg-gradient-to-br from-blue-400 to-blue-300 rounded-full flex items-center justify-center">
                        <CloudRain className="h-5 w-5 text-white" />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Content Panel - Siempre visible */}
              <ContentPanel
                view={currentView}
                onClose={() => handleViewChange('home')}
              />
              
              {/* Loyalty Code Card - Only show in profile view */}
              {currentView === 'profile' && (
                <div className="bg-white rounded-xl shadow-md p-5" style={{borderTop: '4px solid var(--color-primary)'}}>
                  <div className="flex flex-col space-y-4">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="text-sm text-gray-500 font-medium">Código de Fidelización</p>
                        <h2 className="text-xl font-bold text-gray-800 font-mono">{patientData?.surecode || loyaltyCode}</h2>
                      </div>
                    </div>
                    
                    <div className="flex flex-col items-center justify-center space-y-4">
                      {showQR && (patientData?.surecode || loyaltyCode) && (
                        <div className="p-4 bg-white rounded-lg shadow-sm">
                          <QRCode
                            value={patientData?.surecode || loyaltyCode}
                            size={128}
                            level="H"
                            includeMargin={true}
                          />
                        </div>
                      )}
                      {showBarcode && patientData?.surecode && (
                        <div className="p-4 bg-white rounded-lg shadow-sm">
                          <Barcode value={patientData.surecode} width={1.5} height={50} />
                        </div>
                      )}
                      {!patientData?.surecode && !loyaltyCode && (
                        <p className="text-sm text-gray-600 italic">
                          Genere un código para su perfil presionando el botón "Generar código"
                        </p>
                      )}
                    </div>

                    <div className="flex space-x-4 justify-center">
                      {!patientData?.surecode && (
                        <button
                          onClick={generateLoyaltyCode}
                          disabled={isGeneratingCode}
                          className="flex items-center space-x-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors"
                        >
                          {isGeneratingCode ? (
                            <>
                              <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></span>
                              <span>Generando...</span>
                            </>
                          ) : (
                            <span>Generar surecode</span>
                          )}
                        </button>
                      )}

                     

                      <button
                        onClick={() => setShowBarcode((prev) => !prev)}
                        className="px-4 py-2 bg-primary/10 text-primary rounded-lg"
                      >
                        {showBarcode ? 'Ocultar código de barras' : 'Ver código de barras'}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Paciente_Interfaz;