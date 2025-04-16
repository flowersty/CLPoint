// src/components/FarmaciaExample.tsx

import React from 'react';

const FarmaciaExample: React.FC = () => {
  return (
    <div className="p-6 bg-white rounded-lg shadow-lg">
      <h2 className="text-2xl font-bold text-[#4d7c6f] mb-4">Ejemplo de llenado de datos de farmacia</h2>

      <div className="mb-4">
        <h3 className="text-lg font-semibold text-[#4d7c6f]">Nombre de la farmacia</h3>
        <p>Farmacia "La Salud" S.A.</p>
      </div>

      <div className="mb-4">
        <h3 className="text-lg font-semibold text-[#4d7c6f]">Dirección</h3>
        <p>Calle Ficticia 123, Barrio El Centro, Ciudad Ejemplo.</p>
      </div>

      <div className="mb-4">
        <h3 className="text-lg font-semibold text-[#4d7c6f]">Número de teléfono</h3>
        <p>+1 (234) 567-8900</p>
      </div>

      <div className="mb-4">
        <h3 className="text-lg font-semibold text-[#4d7c6f]">Key_Lux (Ejemplo)</h3>
        <p>Se genera automáticamente</p>
      </div>
    </div>
  );
};

export default FarmaciaExample;
