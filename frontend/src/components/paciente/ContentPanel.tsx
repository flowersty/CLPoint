import { useState, useEffect, useRef } from 'react';
import { Calendar as CalendarIcon, ArrowLeft, MapPin } from 'lucide-react';
import supabase from '../../lib/supabaseClient';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import  AppointmentScheduler from './AppointmentScheduler';
import Recetas from './Recetas';

// Fix para los iconos de Leaflet en producción
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png',
});

interface Pharmacy {
  id: string;
  nombre: string;
  ubicacion: string;
  telefono: string;
  horario_atencion: string;
  key_lux: string;
  id_administrador: string;
}

interface ContentPanelProps {
  view: 'appointments' | 'medications' | 'pharmacies' | 'home';
  onClose: () => void;
}

const ContentPanel = ({ view, onClose }: ContentPanelProps) => {
  const [pharmacies, setPharmacies] = useState<Pharmacy[]>([]);
  const [selectedPharmacy, setSelectedPharmacy] = useState<number | null>(null);
  const [mapCenter, setMapCenter] = useState<[number, number]>([19.370442, -99.175322]);
  const [currentSlide, setCurrentSlide] = useState(0);

  const slides = [
    '/carousel/Prom.jpg',
    '/carousel/Prom.jpg',
    '/carousel/Prom.jpg'
  ];

  // Referencias
  const mapRef = useRef<L.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const markerRef = useRef<L.Marker | null>(null);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % slides.length);
    }, 5000);
    return () => clearInterval(timer);
  }, []);

  // Cargar farmacias
  useEffect(() => {
    const fetchPharmacies = async () => {
      const { data, error } = await supabase
        .from('farmacias')
        .select('*');

      if (error) {
        console.error('Error fetching pharmacies:', error);
      } else {
        setPharmacies(data);
      }
    };

    fetchPharmacies();
  }, []);

  // Inicializar mapa
  useEffect(() => {
    if (view === 'pharmacies' && mapContainerRef.current && !mapRef.current) {
      const defaultLocation: [number, number] = [19.370442, -99.175322];
      const initialMap = L.map(mapContainerRef.current).setView(defaultLocation, 13);

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(initialMap);

      mapRef.current = initialMap;

      setTimeout(() => {
        initialMap.invalidateSize();
      }, 100);
    }

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [view, mapCenter]);

  // Manejar clic en farmacia
  const handlePharmacyClick = (pharmacy: Pharmacy) => {
    try {
      setSelectedPharmacy(parseInt(pharmacy.id));
      
      // Validate and parse location
      if (!pharmacy.ubicacion || typeof pharmacy.ubicacion !== 'string') {
        console.error('Invalid location data:', pharmacy.ubicacion);
        return;
      }
  
      const coords = pharmacy.ubicacion.split(',');
      if (coords.length !== 2) {
        console.error('Location format should be "lat,lon":', pharmacy.ubicacion);
        return;
      }
  
      const lat = parseFloat(coords[0].trim());
      const lon = parseFloat(coords[1].trim());
  
      if (isNaN(lat) || isNaN(lon)) {
        console.error('Invalid latitude or longitude:', pharmacy.ubicacion);
        return;
      }
  
      setMapCenter([lat, lon]);
  
      if (mapRef.current) {
        // Mover el mapa
        mapRef.current.flyTo([lat, lon], 15);
        
        // Eliminar marcador anterior si existe
        if (markerRef.current) {
          mapRef.current.removeLayer(markerRef.current);
        }
        
        // Añadir nuevo marcador
        const newMarker = L.marker([lat, lon]).addTo(mapRef.current);
        newMarker.bindPopup(`<b>${pharmacy.nombre}</b><br/>${pharmacy.ubicacion}`).openPopup();
        
        // Guardar referencia
        markerRef.current = newMarker;
      }
    } catch (error) {
      console.error('Error handling pharmacy click:', error);
    }
  };

  const renderPharmacyMap = () => {
    return (
      <div className="p-6">
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center">
            <button onClick={onClose} className="mr-3 text-gray-500 hover:text-gray-700">
              <ArrowLeft className="h-5 w-5" />
            </button>
            <h3 className="text-lg font-semibold text-gray-800">Farmacias Cercanas</h3>
          </div>
        </div>

        <div className="relative mb-6">
          <div 
            ref={mapContainerRef} 
            className="h-80 mb-2 overflow-hidden rounded-lg"
            style={{ height: '320px', width: '100%' }}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {pharmacies.map((pharmacy) => (
            <div 
              key={`pharmacy-${pharmacy.id}`}
              onClick={() => handlePharmacyClick(pharmacy)}
              className={`bg-white rounded-xl shadow-md overflow-hidden hover:shadow-lg transition-shadow duration-300 cursor-pointer ${
                selectedPharmacy === parseInt(pharmacy.id) ? 'ring-2 ring-primary' : ''
              }`}
            >
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="text-xl font-semibold text-gray-900">{pharmacy.nombre}</h4>
                  <span className="text-primary">★★★★★</span>
                </div>
                
                <div className="space-y-3">
                  <div className="flex items-start">
                    <MapPin className="h-5 w-5 text-gray-400 mt-0.5 mr-2 flex-shrink-0" />
                    <p className="text-gray-600">{pharmacy.ubicacion}</p>
                  </div>
                  <div className="flex items-center">
                    <CalendarIcon className="h-5 w-5 text-gray-400 mr-2" />
                    <p className="text-gray-600">{pharmacy.horario_atencion}</p>
                  </div>
                  <div className="text-gray-600">
                    Teléfono: {pharmacy.telefono}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };
  const renderHomeContent = () => {
    const goToSlide = (index: number) => {
      setCurrentSlide(index);
    };
  
    return (
      <div className="p-6 w-full">
        <div className="text-center mb-8">
          <h2 className="text-3xl font-bold text-gray-900 mb-4">¡Bienvenido a Carelux Point!</h2>
        </div>
        
        {/* Contenedor principal del carrusel */}
        <div className="relative w-full max-w-4xl mx-auto h-[400px] overflow-hidden rounded-xl bg-gray-100">
          {/* Contenedor de slides */}
          <div 
            className="flex h-full transition-transform duration-500 ease-in-out"
            style={{ 
              transform: `translateX(-${currentSlide * (100 / slides.length)}%)`,
              width: `${slides.length * 100}%`
            }}
          >
            {slides.map((slide, index) => (
              <div 
                key={index} 
                className="relative w-full h-full flex-shrink-0"
                style={{ width: `${100 / slides.length}%` }}
              >
                <img 
                  src={slide} 
                  alt={`Slide ${index + 1}`} 
                  className="absolute w-full h-full object-cover"
                />
              </div>
            ))}
          </div>
  
          {/* Indicadores */}
          <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-2">
            {slides.map((_, index) => (
              <button
                key={index}
                onClick={() => goToSlide(index)}
                className={`w-3 h-3 rounded-full transition-colors ${currentSlide === index ? 'bg-blue-500' : 'bg-white/70'}`}
                aria-label={`Ir a slide ${index + 1}`}
              />
            ))}
          </div>
  
          {/* Botón anterior */}
          <button
            onClick={() => goToSlide((currentSlide - 1 + slides.length) % slides.length)}
            className="absolute left-4 top-1/2 -translate-y-1/2 bg-white/80 hover:bg-white rounded-full p-2 shadow-md transition-colors"
            aria-label="Slide anterior"
          >
            <ArrowLeft className="h-6 w-6 text-gray-800" />
          </button>
  
          {/* Botón siguiente */}
          <button
            onClick={() => goToSlide((currentSlide + 1) % slides.length)}
            className="absolute right-4 top-1/2 -translate-y-1/2 bg-white/80 hover:bg-white rounded-full p-2 shadow-md transition-colors"
            aria-label="Slide siguiente"
          >
            <ArrowLeft className="h-6 w-6 text-gray-800 transform rotate-180" />
          </button>
        </div>
      </div>
    );
  };
  
  
  switch (view) {
    case 'appointments':
      return <AppointmentScheduler />;
    case 'medications':
      return <Recetas/>;
    case 'pharmacies':
      return renderPharmacyMap();
    case 'home':
      return renderHomeContent();
  }
};

export default ContentPanel;