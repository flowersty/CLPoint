import React, { useState, useEffect } from 'react';
import supabase from '../../lib/supabaseClient';
import AddMedicineModal from './AddMedicineModal';

interface InventoryManagementProps {
  Id_Far: string;
  medicamentosPorCaducar: any[];
  medicamentosSinMovimiento: any[];
  filteredInventario: any[];
  inventarioSearch: string;
  setInventarioSearch: (value: string) => void;
  setShowAddMedicineModal: (value: boolean) => void;
  setIdFarmaciaDisplay: (value: string) => void;
}

const InventoryManagement: React.FC<InventoryManagementProps> = ({
  Id_Far,
  medicamentosPorCaducar,
  medicamentosSinMovimiento,
  filteredInventario,
  inventarioSearch,
  setInventarioSearch,
  setShowAddMedicineModal,
  setIdFarmaciaDisplay
}) => {
  const [error, setError] = useState<string | null>(null);
  const [inventory, setInventory] = useState<any[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);

  const handleDelete = async (id: string) => {
    if (!window.confirm('¿Está seguro de que desea eliminar este medicamento?')) return;

    try {
      const { error } = await supabase
        .from('medicamentos')
        .delete()
        .eq('id_farmaco', id);

      if (error) throw error;

      // Update local state to remove the deleted item
      setInventory(inventory.filter(item => item.id_farmaco !== id));
    } catch (err: any) {
      setError('Error al eliminar el medicamento: ' + err.message);
      console.error('Error al eliminar el medicamento:', err);
    }
  };

  const fetchInventory = async () => {
    try {
      const { data, error } = await supabase
        .from('medicamentos')
        .select('*')
        .eq('id_farmacia', Id_Far);

      if (error) throw error;
      setInventory(data || []);
    } catch (err: any) {
      setError('Error al cargar el inventario: ' + err.message);
      console.error('Error al cargar el inventario:', err);
    }
  };

  useEffect(() => {
    const fetchInventory = async () => {
      try {
        const { data, error } = await supabase
          .from('medicamentos')
          .select('*')
          .eq('id_farmacia', Id_Far);

        if (error) throw error;
        setInventory(data || []);
      } catch (err: any) {
        setError('Error al cargar el inventario: ' + err.message);
        console.error('Error al cargar el inventario:', err);
      }
    };

    if (Id_Far) {
      fetchInventory();
    }
  }, [Id_Far]);

  return (
    <div className="bg-white shadow rounded-lg p-6">
      <h2 className="text-xl font-semibold mb-4">Gestión de Inventario</h2>
      
      {error && <p className="text-red-500 mb-4">{error}</p>}

      <div className="mb-6">
        <div className="flex justify-between items-center mb-4">
          <input
            type="text"
            placeholder="Buscar en inventario..."
            value={inventarioSearch}
            onChange={(e) => setInventarioSearch(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-md w-64"
          />
          <button
            onClick={() => setShowModal(true)}
            className="px-4 py-2 bg-green-500 text-white rounded-md hover:bg-green-600"
          >
            Agregar Medicamento
          </button>
        </div>

        {/* Inventory Table */}
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nombre</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Stock</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Precio</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Acciones</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {inventory.map((item) => (
                <tr key={item.id_farmaco}>
                  <td className="px-6 py-4 whitespace-nowrap">{item.nombre_medicamento}</td>
                  <td className="px-6 py-4 whitespace-nowrap">{item.unidades}</td>
                  <td className="px-6 py-4 whitespace-nowrap">${item.precio_en_pesos}</td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <button 
                      onClick={() => setEditingItem(item)}
                      className="text-blue-600 hover:text-blue-800 mr-2"
                    >
                      Editar
                    </button>
                    <button 
                      onClick={() => handleDelete(item.id_farmaco)}
                      className="text-red-600 hover:text-red-800"
                    >
                      Eliminar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Medicine Modal */}
      <AddMedicineModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        Id_Far={Id_Far}
        onMedicineAdded={() => {
          setShowModal(false);
          fetchInventory();
        }}
      />
    </div>
  );
};

export default InventoryManagement;
