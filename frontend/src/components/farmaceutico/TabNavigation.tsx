import React from 'react';

// Define the types for the props
interface TabNavigationProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

const TabNavigation: React.FC<TabNavigationProps> = ({ activeTab, setActiveTab }) => {
  return (
    <div className="flex border-b mb-6 overflow-x-auto">
      <button 
        className={`px-4 py-2 font-medium whitespace-nowrap ${activeTab === 'pos' ? 'text-[#4d7c6f] border-b-2 border-[#4d7c6f]' : 'text-gray-500'}`}
        onClick={() => setActiveTab('pos')}
      >
        Punto de Venta
      </button>
      <div> </div>
      <button 
        className={`px-4 py-2 font-medium whitespace-nowrap ${activeTab === 'farmaciaInfo' ? 'text-[#4d7c6f] border-b-2 border-[#4d7c6f]' : 'text-gray-500'}`}
        onClick={() => setActiveTab('farmaciaInfo')}
      >
        Información de la Farmacia
      </button>
      <button 
        className={`px-4 py-2 font-medium whitespace-nowrap ${activeTab === 'inventario' ? 'text-[#4d7c6f] border-b-2 border-[#4d7c6f]' : 'text-gray-500'}`}
        onClick={() => setActiveTab('inventario')}
      >
        Gestión de Inventario
      </button>
    </div>
  );
};

export default TabNavigation;
