import { useState, useEffect } from 'react';
import { 
  Download, 
  ChevronDown, 
  ChevronUp, 
  Search, 
  Calendar as CalendarIcon, 
  X, 
  ChevronRight,
  HeartPulse,
  Thermometer,
  Scale,
  Stethoscope,
  AlertCircle,
  ClipboardList,
  User
} from 'lucide-react';
import supabase from '../../lib/supabaseClient';

interface Receta {
  id: string;
  fecha_emision: string;
  fecha_consulta: string;
  proxima_consulta?: string;
  paciente_id: string;
  paciente_nombre: string;
  doctor_id: string;
  doctor_nombre: string;
  medicamentos: string[];
  indicaciones: string;
  farmacia: string;
  diagnostico: string;
  descargable: boolean;
  frecuencia_cardiaca?: number;
  frecuencia_respiratoria?: number;
  temperatura_corporal?: number;
  tension_arterial?: string;
  peso?: number;
  altura?: number;
  imc?: number;
  blood_type?: string;
  allergies?: string;
  motivo_consulta: string;
  antecedentes?: string;
  exploracion_fisica?: string;
  plan_tratamiento?: string;
  recomendaciones?: string;
  observaciones?: string;
}

const Recetas = () => {
  const [recetas, setRecetas] = useState<Receta[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedReceta, setSelectedReceta] = useState<Receta | null>(null);
  const [fechaFilter, setFechaFilter] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [sortConfig, setSortConfig] = useState<{ key: keyof Receta; direction: 'asc' | 'desc' } | null>(null);
  const [mobileView, setMobileView] = useState<'list' | 'detail'>('list');

  // Obtener recetas de Supabase
  const fetchRecetas = async () => {
    try {
      setLoading(true);
      
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuario no autenticado');

      // Obtener ID del paciente
      const { data: pacienteData, error: pacienteError } = await supabase
        .from('patients')
        .select('id, nombre_completo')
        .eq('user_id', user.id)
        .single();

      if (pacienteError || !pacienteData) throw pacienteError || new Error('Paciente no encontrado');

      // Consulta de recetas con join para obtener nombre del doctor
      let query = supabase
        .from('recetas')
        .select(`
          *,
          pacientes:patients(nombre_completo),
          doctores:trabajadores(nombre)
        `)
        .eq('paciente_id', pacienteData.id)
        .order('fecha_consulta', { ascending: false });

      // Aplicar filtro de fecha si existe
      if (fechaFilter) {
        query = query.gte('fecha_consulta', fechaFilter)
                     .lt('fecha_consulta', `${fechaFilter}T23:59:59`);
      }

      const { data, error } = await query;

      if (error) throw error;

      // Formatear datos
      const formattedData = data.map((receta: any) => ({
        ...receta,
        paciente_nombre: receta.pacientes?.nombre_completo || 'Paciente',
        doctor_nombre: receta.doctores?.nombre || 'Doctor',
        medicamentos: receta.medicamentos || [],
        fecha_consulta: new Date(receta.fecha_consulta).toISOString().split('T')[0],
        proxima_consulta: receta.proxima_consulta ? new Date(receta.proxima_consulta).toISOString().split('T')[0] : undefined,
        imc: receta.altura && receta.peso ? parseFloat((receta.peso / ((receta.altura/100) ** 2)).toFixed(2)) : undefined
      }));

      setRecetas(formattedData);
    } catch (error) {
      console.error('Error fetching recetas:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRecetas();
  }, [fechaFilter]);

  // Filtrar y ordenar recetas
  const filteredRecetas = recetas.filter(receta => {
    const matchesSearch = searchTerm 
      ? receta.medicamentos.some(m => m.toLowerCase().includes(searchTerm.toLowerCase())) ||
        receta.doctor_nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
        receta.diagnostico.toLowerCase().includes(searchTerm.toLowerCase()) ||
        receta.motivo_consulta.toLowerCase().includes(searchTerm.toLowerCase())
      : true;
    return matchesSearch;
  });

  const sortedRecetas = [...filteredRecetas].sort((a, b) => {
    if (!sortConfig) return 0;
    
    const aValue = a[sortConfig.key];
    const bValue = b[sortConfig.key];
    
    if (aValue === undefined || bValue === undefined) return 0;
    if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
    if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
    return 0;
  });

  const requestSort = (key: keyof Receta) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const handleDownload = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const { data } = await supabase
        .from('recetas')
        .select('*')
        .eq('id', id)
        .single();

      if (!data) throw new Error('Receta no encontrada');

      // Generar contenido del PDF con toda la información
      const content = `
        RECETA MÉDICA
        Fecha de Emisión: ${new Date(data.fecha_emision).toLocaleDateString('es-ES')}
        Fecha de Consulta: ${new Date(data.fecha_consulta).toLocaleDateString('es-ES')}
        
        INFORMACIÓN DEL PACIENTE
        Paciente: ${data.paciente_nombre}
        Médico Tratante: ${data.doctor_nombre}
        Farmacia: ${data.farmacia || 'No especificada'}
        
        SIGNOS VITALES
        ${data.frecuencia_cardiaca ? `Frecuencia Cardíaca: ${data.frecuencia_cardiaca} lpm\n` : ''}
        ${data.frecuencia_respiratoria ? `Frecuencia Respiratoria: ${data.frecuencia_respiratoria} rpm\n` : ''}
        ${data.temperatura_corporal ? `Temperatura: ${data.temperatura_corporal} °C\n` : ''}
        ${data.tension_arterial ? `Tensión Arterial: ${data.tension_arterial} mmHg\n` : ''}
        ${data.peso ? `Peso: ${data.peso} kg\n` : ''}
        ${data.altura ? `Altura: ${data.altura} cm\n` : ''}
        ${data.imc ? `IMC: ${data.imc} kg/m²\n` : ''}
        ${data.blood_type ? `Tipo de Sangre: ${data.blood_type}\n` : ''}
        ${data.allergies ? `Alergias: ${data.allergies}\n` : ''}
        
        INFORMACIÓN CLÍNICA
        Motivo de Consulta: ${data.motivo_consulta}
        ${data.antecedentes ? `Antecedentes: ${data.antecedentes}\n` : ''}
        Diagnóstico: ${data.diagnostico}
        ${data.exploracion_fisica ? `Exploración Física: ${data.exploracion_fisica}\n` : ''}
        Plan de Tratamiento: ${data.plan_tratamiento || 'No especificado'}
        
        MEDICAMENTOS RECETADOS
        ${data.medicamentos.map((med: any, index: number) => 
          `${index + 1}. ${med.nombre || med}
   ${med.dosis ? `   Dosis: ${med.dosis}\n` : ''}
   ${med.frecuencia ? `   Frecuencia: ${med.frecuencia}\n` : ''}
   ${med.duracion ? `   Duración: ${med.duracion}\n` : ''}`
        ).join('\n')}
        
        INDICACIONES Y RECOMENDACIONES
        Indicaciones: ${data.indicaciones}
        ${data.recomendaciones ? `\nRecomendaciones: ${data.recomendaciones}` : ''}
        ${data.observaciones ? `\nObservaciones: ${data.observaciones}` : ''}
        
        ${data.proxima_consulta ? `Próxima Consulta: ${new Date(data.proxima_consulta).toLocaleDateString('es-ES')}` : ''}
      `;

      const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `receta-${data.fecha_consulta}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error downloading:', error);
    }
  };

  const handleRowClick = (receta: Receta) => {
    setSelectedReceta(receta);
    if (window.innerWidth < 768) {
      setMobileView('detail');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      {/* Header con filtros */}
      <div className="p-4 border-b border-gray-200">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar en recetas..."
              className="pl-10 w-full border border-gray-200 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-primary/50"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2">
            <CalendarIcon className="h-5 w-5 text-gray-500" />
            <input
              type="date"
              className="border border-gray-200 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-primary/50"
              value={fechaFilter}
              onChange={(e) => setFechaFilter(e.target.value)}
              max={new Date().toISOString().split('T')[0]}
            />
            {fechaFilter && (
              <button 
                onClick={() => setFechaFilter('')}
                className="text-gray-500 hover:text-gray-700"
              >
                <X className="h-5 w-5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Vista móvil */}
      {window.innerWidth < 768 && mobileView === 'detail' && selectedReceta ? (
        <div className="p-4">
          <button 
            onClick={() => setMobileView('list')}
            className="flex items-center mb-4 text-gray-600 hover:text-gray-900"
          >
            <ChevronRight className="h-5 w-5 rotate-180 mr-1" />
            Volver a la lista
          </button>
          <RecetaDetail receta={selectedReceta} onDownload={handleDownload} />
        </div>
      ) : (
        /* Tabla estilo Notion */
        <div className="overflow-x-auto">
          <table className="w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <TableHeader 
                  title="Fecha Consulta" 
                  sortKey="fecha_consulta" 
                  sortConfig={sortConfig} 
                  onSort={requestSort}
                  className="pl-6 pr-3 py-3"
                />
                <TableHeader 
                  title="Médico" 
                  sortKey="doctor_nombre" 
                  sortConfig={sortConfig} 
                  onSort={requestSort}
                  className="px-3 py-3"
                />
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Diagnóstico
                </th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Medicamentos
                </th>
                <th className="pl-3 pr-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {sortedRecetas.length > 0 ? (
                sortedRecetas.map((receta) => (
                  <tr 
                    key={receta.id} 
                    className="hover:bg-gray-50 cursor-pointer transition-colors"
                    onClick={() => handleRowClick(receta)}
                  >
                    <td className="pl-6 pr-3 py-4 whitespace-nowrap text-sm text-gray-900">
                      {new Date(receta.fecha_consulta).toLocaleDateString('es-ES')}
                    </td>
                    <td className="px-3 py-4 text-sm text-gray-900">
                      {receta.doctor_nombre}
                    </td>
                    <td className="px-3 py-4 text-sm text-gray-900 max-w-xs truncate">
                      {receta.diagnostico}
                    </td>
                    <td className="px-3 py-4 text-sm text-gray-900">
                      <div className="flex flex-col space-y-1">
                        {receta.medicamentos.slice(0, 2).map((med, idx) => (
                          <span key={idx} className="bg-gray-100 rounded px-2 py-1 text-xs">
                            {typeof med === 'string' ? med : JSON.stringify(med)}
                          </span>
                        ))}
                        {receta.medicamentos.length > 2 && (
                          <span className="text-xs text-gray-500">
                            +{receta.medicamentos.length - 2} más
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="pl-3 pr-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      <button
                        onClick={(e) => handleDownload(receta.id, e)}
                        disabled={!receta.descargable}
                        className={`p-1.5 rounded-md ${receta.descargable ? 
                          'text-primary hover:bg-primary/10' : 
                          'text-gray-300 cursor-not-allowed'}`}
                      >
                        <Download className="h-5 w-5" />
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="px-6 py-4 text-center text-sm text-gray-500">
                    {recetas.length === 0 ? 'No tienes recetas registradas' : 'No se encontraron recetas con los filtros aplicados'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal para desktop */}
      {selectedReceta && window.innerWidth >= 768 && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden">
            <div className="p-6 h-[calc(90vh-3rem)] overflow-y-auto custom-scrollbar">
              <div className="flex justify-between items-start mb-4">
                <h3 className="text-xl font-semibold">Detalle de Receta Médica</h3>
                <button
                  onClick={() => setSelectedReceta(null)}
                  className="text-gray-400 hover:text-gray-500"
                >
                  <X className="h-6 w-6" />
                </button>
              </div>
              <RecetaDetail receta={selectedReceta} onDownload={handleDownload} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Componente auxiliar para el detalle
const RecetaDetail = ({ receta, onDownload }: { receta: Receta, onDownload: (id: string, e: React.MouseEvent) => void }) => {
  const renderMedicamentos = (medicamentos: any[]) => {
    return medicamentos.map((medicamento, index) => (
      <div key={index} className="mb-4 p-4 bg-white rounded-lg shadow">
        <h4 className="font-semibold text-lg mb-2">Medicamento {index + 1}</h4>
        {medicamento.nombre && (
          <p className="mb-1"><span className="font-medium">Nombre:</span> {medicamento.nombre}</p>
        )}
        {medicamento.dosis && (
          <p className="mb-1"><span className="font-medium">Dosis:</span> {medicamento.dosis}</p>
        )}
        {medicamento.frecuencia && (
          <p className="mb-1"><span className="font-medium">Frecuencia:</span> {medicamento.frecuencia}</p>
        )}
        {medicamento.duracion && (
          <p className="mb-1"><span className="font-medium">Duración:</span> {medicamento.duracion}</p>
        )}
      </div>
    ));
  };
  return (
    <div className="space-y-6 overflow-y-auto max-h-[calc(100vh-12rem)] pr-4 pb-8 custom-scrollbar">
      {/* Encabezado */}
      <div className="border-b pb-4">
        <div className="flex justify-between items-start">
          <div>
            <h3 className="text-xl font-semibold">Receta Médica</h3>
            <p className="text-sm text-gray-500">
              Emitida el {new Date(receta.fecha_emision).toLocaleDateString('es-ES')}
            </p>
          </div>
          <button
            onClick={(e) => onDownload(receta.id, e)}
            disabled={!receta.descargable}
            className={`inline-flex items-center px-4 py-2 rounded-md text-sm font-medium ${receta.descargable ? 
              'bg-primary text-white hover:bg-primary-dark' : 
              'bg-gray-200 text-gray-500 cursor-not-allowed'}`}
          >
            <Download className="mr-2 h-4 w-4" />
            Descargar
          </button>
        </div>
      </div>

      {/* Sección de información básica */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-4">
          <div>
            <h4 className="text-sm font-medium text-gray-500 flex items-center">
              <User className="h-4 w-4 mr-2" />
              Paciente
            </h4>
            <p className="mt-1 text-sm text-gray-900">{receta.paciente_nombre}</p>
          </div>
          
          <div>
            <h4 className="text-sm font-medium text-gray-500 flex items-center">
              <Stethoscope className="h-4 w-4 mr-2" />
              Médico Tratante
            </h4>
            <p className="mt-1 text-sm text-gray-900">{receta.doctor_nombre}</p>
          </div>
          
          <div>
            <h4 className="text-sm font-medium text-gray-500">Farmacia</h4>
            <p className="mt-1 text-sm text-gray-900">{receta.farmacia || 'No especificada'}</p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <h4 className="text-sm font-medium text-gray-500">Fecha de Consulta</h4>
            <p className="mt-1 text-sm text-gray-900">
              {new Date(receta.fecha_consulta).toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </p>
          </div>
          
          {receta.proxima_consulta && (
            <div>
              <h4 className="text-sm font-medium text-gray-500">Próxima Consulta</h4>
              <p className="mt-1 text-sm text-gray-900">
                {new Date(receta.proxima_consulta).toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Signos vitales */}
      <div className="border-t border-gray-200 pt-4">
        <h3 className="text-lg font-medium text-gray-900 mb-3 flex items-center">
          <HeartPulse className="h-5 w-5 mr-2 text-red-500" />
          Signos Vitales
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {receta.frecuencia_cardiaca && (
            <div className="bg-gray-50 p-3 rounded-lg">
              <h4 className="text-xs font-medium text-gray-500">Frec. Cardíaca</h4>
              <p className="mt-1 text-lg font-semibold text-gray-900">
                {receta.frecuencia_cardiaca} <span className="text-sm font-normal">lpm</span>
              </p>
            </div>
          )}
          
          {receta.frecuencia_respiratoria && (
            <div className="bg-gray-50 p-3 rounded-lg">
              <h4 className="text-xs font-medium text-gray-500">Frec. Respiratoria</h4>
              <p className="mt-1 text-lg font-semibold text-gray-900">
                {receta.frecuencia_respiratoria} <span className="text-sm font-normal">rpm</span>
              </p>
            </div>
          )}
          
          {receta.temperatura_corporal && (
            <div className="bg-gray-50 p-3 rounded-lg">
              <h4 className="text-xs font-medium text-gray-500 flex items-center">
                <Thermometer className="h-3 w-3 mr-1" />
                Temperatura
              </h4>
              <p className="mt-1 text-lg font-semibold text-gray-900">
                {receta.temperatura_corporal} <span className="text-sm font-normal">°C</span>
              </p>
            </div>
          )}
          
          {receta.tension_arterial && (
            <div className="bg-gray-50 p-3 rounded-lg">
              <h4 className="text-xs font-medium text-gray-500">Tensión Arterial</h4>
              <p className="mt-1 text-lg font-semibold text-gray-900">
                {receta.tension_arterial} <span className="text-sm font-normal">mmHg</span>
              </p>
            </div>
          )}
          
          {receta.peso && receta.altura && (
            <>
              <div className="bg-gray-50 p-3 rounded-lg">
                <h4 className="text-xs font-medium text-gray-500 flex items-center">
                  <Scale className="h-3 w-3 mr-1" />
                  Peso
                </h4>
                <p className="mt-1 text-lg font-semibold text-gray-900">
                  {receta.peso} <span className="text-sm font-normal">kg</span>
                </p>
              </div>
              
              <div className="bg-gray-50 p-3 rounded-lg">
                <h4 className="text-xs font-medium text-gray-500">Altura</h4>
                <p className="mt-1 text-lg font-semibold text-gray-900">
                  {receta.altura} <span className="text-sm font-normal">cm</span>
                </p>
              </div>
              
              <div className="bg-gray-50 p-3 rounded-lg">
                <h4 className="text-xs font-medium text-gray-500">IMC</h4>
                <p className="mt-1 text-lg font-semibold text-gray-900">
                  {receta.imc} <span className="text-sm font-normal">kg/m²</span>
                </p>
              </div>
            </>
          )}
          
          {receta.blood_type && (
            <div className="bg-gray-50 p-3 rounded-lg">
              <h4 className="text-xs font-medium text-gray-500">Tipo de Sangre</h4>
              <p className="mt-1 text-lg font-semibold text-gray-900">
                {receta.blood_type}
              </p>
            </div>
          )}
          
          {receta.allergies && (
            <div className="bg-gray-50 p-3 rounded-lg md:col-span-2">
              <h4 className="text-xs font-medium text-gray-500 flex items-center">
                <AlertCircle className="h-3 w-3 mr-1" />
                Alergias
              </h4>
              <p className="mt-1 text-sm text-gray-900">
                {receta.allergies}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Información clínica */}
      <div className="space-y-4">
        <div className="border-t border-gray-200 pt-4">
          <h3 className="text-lg font-medium text-gray-900 mb-3 flex items-center">
            <ClipboardList className="h-5 w-5 mr-2 text-blue-500" />
            Información Clínica
          </h3>
          
          <div className="space-y-4">
            <div>
              <h4 className="text-sm font-medium text-gray-500">Motivo de Consulta</h4>
              <p className="mt-1 text-sm text-gray-900">{receta.motivo_consulta}</p>
            </div>
            
            {receta.antecedentes && (
              <div>
                <h4 className="text-sm font-medium text-gray-500">Antecedentes</h4>
                <p className="mt-1 text-sm text-gray-900 whitespace-pre-line">{receta.antecedentes}</p>
              </div>
            )}
            
            <div>
              <h4 className="text-sm font-medium text-gray-500">Diagnóstico</h4>
              <p className="mt-1 text-sm text-gray-900 font-medium">{receta.diagnostico}</p>
            </div>
            
            {receta.exploracion_fisica && (
              <div>
                <h4 className="text-sm font-medium text-gray-500">Exploración Física</h4>
                <p className="mt-1 text-sm text-gray-900 whitespace-pre-line">{receta.exploracion_fisica}</p>
              </div>
            )}
            
            <div>
              <h4 className="text-sm font-medium text-gray-500">Plan de Tratamiento</h4>
              <p className="mt-1 text-sm text-gray-900 whitespace-pre-line">{receta.plan_tratamiento}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Medicamentos */}
      <div className="border-t border-gray-200 pt-4">
        <h3 className="text-lg font-medium text-gray-900 mb-3">Medicamentos Recetados</h3>
        {renderMedicamentos(receta.medicamentos)}
      </div>

      {/* Indicaciones y recomendaciones */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="border-t border-gray-200 pt-4">
          <h3 className="text-lg font-medium text-gray-900 mb-3">Indicaciones</h3>
          <div className="bg-gray-50 rounded-lg p-4">
            <p className="text-sm text-gray-900 whitespace-pre-line">{receta.indicaciones}</p>
          </div>
        </div>
        
        {receta.recomendaciones && (
          <div className="border-t border-gray-200 pt-4">
            <h3 className="text-lg font-medium text-gray-900 mb-3">Recomendaciones</h3>
            <div className="bg-gray-50 rounded-lg p-4">
              <p className="text-sm text-gray-900 whitespace-pre-line">{receta.recomendaciones}</p>
            </div>
          </div>
        )}
      </div>

      {receta.observaciones && (
        <div className="border-t border-gray-200 pt-4">
          <h3 className="text-lg font-medium text-gray-900 mb-3">Observaciones</h3>
          <p className="text-sm text-gray-900 whitespace-pre-line">{receta.observaciones}</p>
        </div>
      )}
    </div>
  );
};

// Componente auxiliar para headers ordenables
const TableHeader = ({ 
  title, 
  sortKey, 
  sortConfig, 
  onSort,
  className 
}: { 
  title: string; 
  sortKey: keyof Receta; 
  sortConfig: { key: keyof Receta; direction: 'asc' | 'desc' } | null; 
  onSort: (key: keyof Receta) => void;
  className?: string;
}) => {
  return (
    <th 
      className={`text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer ${className}`}
      onClick={() => onSort(sortKey)}
    >
      <div className="flex items-center">
        {title}
        {sortConfig?.key === sortKey && (
          sortConfig.direction === 'asc' ? 
            <ChevronUp className="ml-1 h-4 w-4" /> : 
            <ChevronDown className="ml-1 h-4 w-4" />
        )}
      </div>
    </th>
  );
};

export default Recetas;