import { useState, useEffect } from 'react';
import { Bell, Settings, User, Search, Menu } from 'lucide-react';
import supabase from '../../lib/supabaseClient';

interface PatientData {
  nombre_completo?: string;
  name?: string;
}

interface HeaderProps {
  patientData: PatientData;
}

const Header = ({ patientData }: HeaderProps) => {
  const [scrolled, setScrolled] = useState<boolean>(false);
  const [time, setTime] = useState<Date>(new Date());
  const [isMenuOpen, setIsMenuOpen] = useState<boolean>(false);
  const [isGeneratingCode, setIsGeneratingCode] = useState<boolean>(false);

  const generateLoyaltyCode = async () => {
    try {
      setIsGeneratingCode(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const code = Math.random().toString(36).substring(2, 10).toUpperCase();
      
      const { error } = await supabase
        .from('patients')
        .update({ tag_rfid: code })
        .eq('user_id', user.id);

      if (error) throw error;
      alert('Código de fidelización generado con éxito: ' + code);
    } catch (error) {
      console.error('Error generating loyalty code:', error);
      alert('Error al generar el código de fidelización');
    } finally {
      setIsGeneratingCode(false);
    }
  };
  
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
  
  // Actualizar hora cada minuto
  useEffect(() => {
    const interval = setInterval(() => {
      setTime(new Date());
    }, 60000);
    
    return () => clearInterval(interval);
  }, []);
  
  // Detectar scroll para cambiar estilo del header
  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 10);
    };
    
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);
  
  // Formato de hora
  const formatTime = (date: Date): string => {
    return date.toLocaleTimeString('es-ES', {
      hour: '2-digit', 
      minute: '2-digit',
      hour12: false
    });
  };
  
  // Formato de fecha
  const formatDate = (date: Date): string => {
    return date.toLocaleDateString('es-ES', {
      weekday: 'long', 
      day: 'numeric', 
      month: 'long'
    });
  };

  // Saludar según la hora del día
  const getGreeting = (): string => {
    const hour = time.getHours();
    if (hour < 12) return 'Buenos días';
    if (hour < 19) return 'Buenas tardes';
    return 'Buenas noches';
  };

  return (
    <header 
      className={`sticky top-0 z-30 w-full transition-all duration-300 ${scrolled ? 'bg-white shadow-md py-2' : 'bg-transparent py-4'}`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center">
          {/* Logo y saludos */}
          <div className="flex items-center">
            <div className="hidden md:block">
              <div className="flex flex-col">
                <span className="text-sm text-gray-500 font-light">
                  {formatDate(time)} · {formatTime(time)}
                </span>
                <h1 className="text-xl font-semibold text-gray-800 font-inter">
                  {getGreeting()} <span style={{ color: 'var(--color-primary)' }}>{patientData?.nombre_completo || patientData?.name || ''}</span>
                </h1>
              </div>
            </div>
            
            {/* Botón de menú móvil */}
            <button 
              className="md:hidden mr-4 text-gray-500 hover:text-gray-700"
              onClick={() => setIsMenuOpen(!isMenuOpen)}
            >
              <Menu className="h-6 w-6" />
            </button>
          </div>

          {/* Acciones y navegación */}
          <div className="flex items-center space-x-4">
            {/* Notificaciones */}
            <button className="relative p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-full">
              <Bell className="h-5 w-5" />
              <span className="absolute top-1 right-1 h-2 w-2 bg-accent rounded-full"></span>
            </button>
            
            {/* Configuración */}
            <button className="hidden sm:block p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-full">
              <Settings className="h-5 w-5" />
            </button>
            
            {/* Perfil */}
            <button className="flex items-center space-x-2">
              <div className="h-8 w-8 bg-primary rounded-full flex items-center justify-center text-white">
                <User className="h-5 w-5" />
              </div>
              <span className="hidden md:inline-block text-sm font-medium"></span>
            </button>
          </div>
        </div>
        
        {/* Menú móvil */}
        {isMenuOpen && (
          <div className="md:hidden mt-4 bg-white rounded-lg shadow-lg p-4 absolute left-4 right-4 z-50">
            <div className="flex items-center bg-gray-100 rounded-lg px-3 py-2 mb-4">
              <Search className="h-4 w-4 text-gray-400 mr-2" />
              <input 
                type="text" 
               
                className="bg-transparent border-none outline-none text-sm flex-1 placeholder-gray-400"
              />
            </div>
            
            <nav className="flex flex-col space-y-3">
              <a href="#" className="flex items-center px-2 py-2 text-gray-700 hover:bg-gray-100 rounded-lg">
                <span>Inicio</span>
              </a>
              <a href="#" className="flex items-center px-2 py-2 text-gray-700 hover:bg-gray-100 rounded-lg">
                <span>Calendario</span>
              </a>
              <a href="#" className="flex items-center px-2 py-2 text-gray-700 hover:bg-gray-100 rounded-lg">
                <span>Recetas</span>
              </a>
              <a href="#" className="flex items-center px-2 py-2 text-gray-700 hover:bg-gray-100 rounded-lg">
                <span>Farmacias</span>
              </a>
            </nav>
          </div>
        )}
      </div>
    </header>
  );
};

export default Header;
