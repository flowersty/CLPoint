// src/components/FarmaciaForm.tsx

import { useState, ChangeEvent, FormEvent } from 'react';
import PropTypes from 'prop-types';
import CryptoJS from 'crypto-js';
import supabase from "../../lib/supabaseClient";
import QRCode from 'react-qr-code';
import { Plus } from 'lucide-react';

// Definir tipos para los datos del formulario
interface FormData {
  nombreFarmacia: string;
  direccion: string;
  telefono: string;
  horaApertura: string;
  horaCierre: string;
  keyLux: string;
}

// Definir tipo para las props del componente
interface FarmaciaFormProps {
  onFarmaciaSaved: (farmaciaData: any) => void;
}

const FarmaciaForm: React.FC<FarmaciaFormProps> = ({ onFarmaciaSaved }) => {
  const [formData, setFormData] = useState<FormData>({
    nombreFarmacia: '',
    direccion: '',
    telefono: '',
    horaApertura: '',
    horaCierre: '',
    keyLux: ''
  });

  // Función para generar la Key_Lux de manera segura usando un hash
  const generateKeyLux = (): string => {
    const { nombreFarmacia, direccion, telefono } = formData;
    const keyString = `${nombreFarmacia}-${direccion}-${telefono}-${Date.now()}`; // Combina los datos y un timestamp
    const hash = CryptoJS.SHA256(keyString).toString(CryptoJS.enc.Base64); // Crea un hash en Base64
    return hash;
  };

  const handleInputChange = (e: ChangeEvent<HTMLInputElement>): void => {
    const { id, value } = e.target;
    setFormData((prevData) => ({
      ...prevData,
      [id]: value
    }));
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    const generatedKeyLux = generateKeyLux();

    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError) throw userError;

      const farmaciaData = {
        nombre: formData.nombreFarmacia,
        id_administrador: user.id,
        key_lux: generatedKeyLux,
        ubicacion: formData.direccion,
        telefono: formData.telefono,
        horario_atencion: `${formData.horaApertura} - ${formData.horaCierre}`
      };

      const { data, error } = await supabase
        .from('farmacias')
        .insert([farmaciaData])
        .select()
        .single();

      if (error) throw error;

      setFormData((prevData) => ({
        ...prevData,
        keyLux: generatedKeyLux
      }));

      if (onFarmaciaSaved) {
        onFarmaciaSaved({ ...data, keyLux: generatedKeyLux });
      }

      setFormData({
        nombreFarmacia: '',
        direccion: '',
        telefono: '',
        horaApertura: '',
        horaCierre: '',
        keyLux: ''
      });

      alert('Farmacia registrada exitosamente!');
      setShowForm(false);

    } catch (error) {
      console.error('Error al guardar la farmacia:', error.message);
      alert('Error al guardar la farmacia. Por favor, intente nuevamente.');
    }
  };

  return (
    <div className="p-6 bg-white rounded-lg shadow-lg">
      {(
        <>
          <h2 className="text-2xl font-bold text-[#4d7c6f] mb-4">Registrar Nueva Farmacia</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="nombreFarmacia" className="block text-sm font-medium text-gray-700 mb-1">
                Nombre de la Farmacia
              </label>
              <input
                type="text"
                id="nombreFarmacia"
                value={formData.nombreFarmacia}
                onChange={handleInputChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-[#4d7c6f]"
                required
              />
            </div>

            <div>
              <label htmlFor="direccion" className="block text-sm font-medium text-gray-700 mb-1">
                Dirección
              </label>
              <input
                type="text"
                id="direccion"
                value={formData.direccion}
                onChange={handleInputChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-[#4d7c6f]"
                required
              />
            </div>

            <div>
              <label htmlFor="telefono" className="block text-sm font-medium text-gray-700 mb-1">
                Teléfono
              </label>
              <input
                type="tel"
                id="telefono"
                value={formData.telefono}
                onChange={handleInputChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-[#4d7c6f]"
                required
              />
            </div>

            <div>
              <label htmlFor="horaApertura" className="block text-sm font-medium text-gray-700 mb-1">
                Hora de Apertura
              </label>
              <input
                type="time"
                id="horaApertura"
                value={formData.horaApertura}
                onChange={handleInputChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-[#4d7c6f]"
                required
              />
            </div>

            <div>
              <label htmlFor="horaCierre" className="block text-sm font-medium text-gray-700 mb-1">
                Hora de Cierre
              </label>
              <input
                type="time"
                id="horaCierre"
                value={formData.horaCierre}
                onChange={handleInputChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-[#4d7c6f]"
                required
              />
            </div>

            <div className="flex gap-4">
              <button
                type="submit"
                className="flex-1 py-2 px-4 bg-[#4d7c6f] text-white rounded-md hover:bg-[#3a5e54] mt-4"
              >
                Guardar Farmacia
              </button>
              <button
                type="button"
                onClick={() => onFarmaciaSaved(null)}
                className="flex-1 py-2 px-4 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 mt-4"
              >
                Cancelar
              </button>
            </div>
          </form>

          {formData.keyLux && (
            <div className="mt-4 text-center">
              <h3 className="text-lg font-semibold">Código QR de Key_Lux</h3>
              <QRCode value={formData.keyLux} size={128} />
            </div>
          )}
        </>
      )}
    </div>
  );
};

FarmaciaForm.propTypes = {
  onFarmaciaSaved: PropTypes.func.isRequired,
};

export default FarmaciaForm;
