import React, { useState } from 'react';
import supabase from '../../lib/supabaseClient';
import { X } from 'lucide-react';

interface AddMedicineModalProps {
  isOpen: boolean;
  onClose: () => void;
  Id_Far: string;
  onMedicineAdded: () => void;
}

interface MedicineFormData {
  marca_comercial: string;
  nombre_medicamento: string;
  precio_en_pesos: number;
  upc?: string;
  unidades: number;
  lote?: string;
  ubicacion_stand?: string;
  fecha_caducidad?: string;
  fecha_ingreso?: string;
  fraccion?: string;
  stock_minimo: number;
  categoria?: string;
}

const AddMedicineModal: React.FC<AddMedicineModalProps> = ({
  isOpen,
  onClose,
  Id_Far,
  onMedicineAdded
}) => {
  const [formData, setFormData] = useState<MedicineFormData>({
    marca_comercial: '',
    nombre_medicamento: '',
    precio_en_pesos: 0,
    upc: '',
    unidades: 0,
    lote: '',
    ubicacion_stand: '',
    fecha_caducidad: '',
    fraccion: '',
    stock_minimo: 0,
    categoria: ''
  });

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'number' ? parseFloat(value) || 0 : value
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      // Validate required fields
      if (!formData.marca_comercial || !formData.nombre_medicamento || formData.unidades < 0 || formData.precio_en_pesos <= 0 || formData.stock_minimo < 0) {
        throw new Error('Por favor complete todos los campos requeridos correctamente');
      }

      const { data, error: supabaseError } = await supabase
        .from('medicamentos')
        .insert([{
          ...formData,
          id_farmacia: Id_Far,
          fecha_ingreso: new Date().toISOString()
        }])
        .select();

      if (supabaseError) throw supabaseError;

      onMedicineAdded(); // Refresh inventory list
      onClose(); // Close modal
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-8 w-full max-w-5xl relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-500 hover:text-gray-700"
        >
          <X size={24} />
        </button>

        <h2 className="text-xl font-semibold mb-4">Agregar Nuevo Medicamento</h2>

        {error && (
          <div className="mb-4 p-3 bg-red-100 text-red-700 rounded-md">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Nombre del Medicamento*
              </label>
              <input
                type="text"
                name="nombre_medicamento"
                value={formData.nombre_medicamento}
                onChange={handleInputChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Unidades*
              </label>
              <input
                type="number"
                name="unidades"
                value={formData.unidades}
                onChange={handleInputChange}
                min="0"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Precio (MXN)*
              </label>
              <input
                type="number"
                name="precio_en_pesos"
                value={formData.precio_en_pesos}
                onChange={handleInputChange}
                min="0"
                step="0.01"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Fecha de Caducidad
              </label>
              <input
                type="date"
                name="fecha_caducidad"
                value={formData.fecha_caducidad}
                onChange={handleInputChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                UPC
              </label>
              <input
                type="text"
                name="upc"
                value={formData.upc}
                onChange={handleInputChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Marca Comercial*
              </label>
              <input
                type="text"
                name="marca_comercial"
                value={formData.marca_comercial}
                onChange={handleInputChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Lote
              </label>
              <input
                type="text"
                name="lote"
                value={formData.lote}
                onChange={handleInputChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Ubicación en Stand
              </label>
              <input
                type="text"
                name="ubicacion_stand"
                value={formData.ubicacion_stand}
                onChange={handleInputChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Fracción
              </label>
              <select
                name="fraccion"
                value={formData.fraccion}
                onChange={handleInputChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="">Seleccionar fracción</option>
                <option value="I">I</option>
                <option value="II">II</option>
                <option value="III">III</option>
                <option value="IV">IV</option>
                <option value="V">V</option>
                <option value="VI">VI</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Categoría
              </label>
              <select
                name="categoria"
                value={formData.categoria}
                onChange={handleInputChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="">Seleccionar categoría</option>
                <option value="farmaco">Fármaco</option>
                <option value="uso personal">Uso Personal</option>
                <option value="insumos medicos">Insumos Médicos</option>
                <option value="otros">Otros</option>
              </select>
            </div>
          </div>

          <div className="flex justify-end space-x-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
              disabled={loading}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-white bg-blue-500 rounded-md hover:bg-blue-600 disabled:bg-blue-300"
              disabled={loading}
            >
              {loading ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddMedicineModal;