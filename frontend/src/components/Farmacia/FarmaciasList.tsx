// src/components/FarmaciasList.tsx

import { useState, useEffect } from 'react';
import supabase from '../../lib/supabaseClient';
import QRCode from 'react-qr-code';
import { Plus } from 'lucide-react';
import FarmaciaForm from './FarmaciaForm';

interface Farmacia {
  id: string;
  nombre: string;
  ubicacion: string;
  telefono: string;
  horario_atencion: string;
  key_lux: string;
  id_administrador: string;
}

const FarmaciasList: React.FC = () => {
  const [farmacias, setFarmacias] = useState<Farmacia[]>([]);
  const [selectedFarmacia, setSelectedFarmacia] = useState<Farmacia | null>(null);

  useEffect(() => {
    loadFarmacias();
  }, []);

  const loadFarmacias = async () => {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (user && !error) {
      const { data, error } = await supabase
        .from('farmacias')
        .select('*')
        .eq('id_administrador', user.id);

      if (!error && data) {
        setFarmacias(data);
      } else {
        console.error('Error loading farmacias:', error?.message);
      }
    }
  };
  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const handleClick = () => {
    setMostrarFormulario(true);
  };
  return (
    <div className="p-6 bg-white rounded-lg shadow-lg relative">
      <div>
      <button
        onClick={handleClick}
        className="px-6 py-3 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors flex items-center justify-center"
      >
        <Plus className="w-5 h-5 mr-2" />
        Añadir Nueva Farmacia
      </button>

      {/* Si el estado mostrarFormulario es true, mostramos el formulario */}
      {mostrarFormulario && <FarmaciaForm onFarmaciaSaved={() => setMostrarFormulario(false)}/>}
    </div>

      {farmacias.length === 0 ? (
        <p className="text-center text-lg text-gray-500">Agrega una farmacia para comenzar.</p>
      ) : (
        <ul className="space-y-4">
          {farmacias.map((farmacia) => (
            <li
              key={farmacia.id}
              className="p-4 border border-gray-300 rounded-md hover:bg-[#4d7c6f]/10 transition-colors"
            >
              <div>
                <h3 className="text-xl font-semibold text-[#4d7c6f]">{farmacia.nombre}</h3>
                <p>{farmacia.ubicacion}</p>
                <p>Horario: {farmacia.horario_atencion}</p>
                <div className="flex gap-2 mt-2">
                  <button
                    onClick={() => setSelectedFarmacia(farmacia)}
                    className="px-4 py-2 bg-[#4d7c6f] text-white rounded-md hover:bg-[#3a5e54] text-sm"
                  >
                    Ver QR Key_Lux
                  </button>
                  <button
                    onClick={() => window.location.href = '/doctor'}
                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm"
                  >
                    Entrar al DoctorRec
                  </button>
                  <button
                    onClick={() => window.location.href = '/farmaceutico'}
                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm"
                  >
                    Entrar al POS
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {selectedFarmacia && (
        <div className="fixed top-0 right-0 h-full w-80 bg-white shadow-lg p-6 transform transition-transform duration-300 ease-in-out">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold text-[#4d7c6f]">{selectedFarmacia.nombre}</h3>
            <button
              onClick={() => setSelectedFarmacia(null)}
              className="text-gray-500 hover:text-gray-700"
            >
              ✕
            </button>
          </div>
          <div className="text-center">
            <p className="mb-4 text-sm text-gray-600">Código QR de Key_Lux</p>
            <div className="bg-white p-4 rounded-lg shadow-inner inline-block">
              <QRCode value={selectedFarmacia.key_lux} size={200} />
            </div>
            <p className="mt-4 text-xs text-gray-500 break-all">{selectedFarmacia.key_lux}</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default FarmaciasList;
