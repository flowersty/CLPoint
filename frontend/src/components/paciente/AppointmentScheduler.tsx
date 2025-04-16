import { useState, useEffect } from 'react';
import { Calendar, Clock, User, FileText } from 'lucide-react';
import supabase from '../../lib/supabaseClient';
import { toast } from 'react-hot-toast';

interface AppointmentFormData {
  pharmacyId: number | null;
  date: string;
  time: string;
  reason: string;
}

interface Pharmacy {
  id_farmacia: number;
  nombre: string;
  horario_atencion: string;
}

const AppointmentScheduler = () => {
  const [selectedPharmacy, setSelectedPharmacy] = useState<Pharmacy | null>(null);
  const [availableTimes, setAvailableTimes] = useState<string[]>([]);
  const [formData, setFormData] = useState<AppointmentFormData>({
    pharmacyId: null,
    date: '',
    time: '',
    reason: ''
  });

  const [currentStep, setCurrentStep] = useState(1);
  const totalSteps = 3;
  const [pharmacies, setPharmacies] = useState<Pharmacy[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchPharmacies = async () => {
      try {
        const { data, error } = await supabase
          .from('farmacias')
          .select('id_farmacia, nombre, horario_atencion');

        if (error) throw error;

        setPharmacies(data || []);
      } catch (error) {
        console.error('Error fetching pharmacies:', error);
        toast.error('Error al cargar las farmacias');
      } finally {
        setLoading(false);
      }
    };

    fetchPharmacies();
  }, []);

  const parseBusinessHours = (horarioAtencion: string) => {
    const times: string[] = [];
    const [morning, afternoon] = horarioAtencion.split(' y ');

    const parseTimeRange = (range: string) => {
      const [start, end] = range.match(/\d{1,2}:\d{2}/g) || [];
      if (start && end) {
        let currentTime = new Date(`2000/01/01 ${start}`);
        const endTime = new Date(`2000/01/01 ${end}`);

        while (currentTime <= endTime) {
          times.push(currentTime.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }));
          currentTime.setMinutes(currentTime.getMinutes() + 30);
        }
      }
    };

    if (morning) parseTimeRange(morning);
    if (afternoon) parseTimeRange(afternoon);

    return times;
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;

    if (name === 'pharmacy') {
      const selected = pharmacies.find(p => p.id_farmacia === parseInt(value));
      setSelectedPharmacy(selected || null);
      if (selected) {
        const times = parseBusinessHours(selected.horario_atencion);
        setAvailableTimes(times);
        setFormData(prev => ({
          ...prev,
          pharmacyId: selected.id_farmacia,  // Guardar solo el id_farmacia
        }));
      }
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
  };

  const handleNext = () => {
    if (currentStep === 1 && !formData.pharmacyId) {
      toast.error('Selecciona una farmacia antes de continuar');
      return;
    }

    if (currentStep === 2 && (!formData.date || !formData.time)) {
      toast.error('Selecciona una fecha y hora antes de continuar');
      return;
    }

    if (currentStep < totalSteps) {
      setCurrentStep(prev => prev + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(prev => prev - 1);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.pharmacyId || !formData.date || !formData.time || !formData.reason) {
      toast.error("Por favor, completa todos los campos.");
      return;
    }

    const userId = "f76a78c1-1fa6-4bc7-a6c9-10ffa2e2f047"; // Usa el ID del usuario correspondiente

    const citaData = {
      horario_cita: `${formData.date} ${formData.time}:00`,
      dia_atencion: formData.date,
      id_usuario: userId,
      created_at: new Date().toISOString(),
      last_updated_at: new Date().toISOString(),
      id_farmacias: formData.pharmacyId,  // Enviar solo el id_farmacia
    };

    try {
      const { error } = await supabase
        .from("citas")
        .insert([citaData]);

      if (error) {
        console.error("Error al agendar la cita:", error);
        throw error;
      }

      toast.success("¡Cita agendada exitosamente!", {
        duration: 5000,
        position: "top-center",
        style: {
          background: "#10B981",
          color: "#fff",
          padding: "16px",
          borderRadius: "8px",
          fontSize: "16px",
          fontWeight: "500",
        },
        icon: "✅",
      });

      setFormData({ pharmacyId: null, date: "", time: "", reason: "" });
      setCurrentStep(1);
    } catch (error) {
      console.error("Error al agendar la cita:", error);
      toast.error("Error al agendar la cita.");
    }
  };

  const generateDates = () => {
    const dates: { date: string, display: string }[] = [];
    const today = new Date();

    for (let i = 1; i <= 14; i++) {
      const date = new Date(today);
      date.setDate(today.getDate() + i);

      if (date.getDay() !== 0 && date.getDay() !== 6) {
        dates.push({
          date: date.toISOString().split('T')[0],
          display: date.toLocaleDateString('es-ES', {
            weekday: 'short',
            day: 'numeric',
            month: 'short'
          })
        });
      }
    }

    return dates;
  };

  const availableDates = generateDates();

  const renderStep = () => {
    switch (currentStep) {
      case 1:
        return (
          <div className="space-y-4">
            <h4 className="text-sm font-medium text-gray-700 mb-2">Selecciona una farmacia</h4>
            {loading ? (
              <div className="text-center py-4">Cargando farmacias...</div>
            ) : (
              <select
                name="pharmacy"
                value={formData.pharmacyId || ''}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                required
              >
                <option value="">Selecciona farmacia</option>
                {pharmacies.map((pharmacy) => (
                  <option key={pharmacy.id_farmacia} value={pharmacy.id_farmacia}>
                    {pharmacy.nombre} - {pharmacy.horario_atencion}
                  </option>
                ))}
              </select>
            )}
          </div>
        );

      case 2:
        return (
          <div className="space-y-4">
            <div>
              <h4 className="text-sm font-medium text-gray-700 mb-2">Selecciona una fecha</h4>
              <div className="grid grid-cols-3 gap-2">
                {availableDates.map((dateObj, index) => (
                  <label
                    key={`${dateObj.date}-${index}`}
                    className={`flex flex-col items-center p-2 border rounded-md cursor-pointer text-center ${
                      formData.date === dateObj.date
                        ? 'border-primary bg-primary bg-opacity-5'
                        : 'border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="date"
                      value={dateObj.date}
                      checked={formData.date === dateObj.date}
                      onChange={handleChange}
                      className="sr-only"
                    />
                    <div className="h-8 w-8 mb-1">
                      <Calendar className="h-6 w-6 mx-auto text-gray-500" />
                    </div>
                    <span className="text-xs font-medium">{dateObj.display}</span>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <h4 className="text-sm font-medium text-gray-700 mb-2">Selecciona una hora</h4>
              <div className="grid grid-cols-4 gap-2">
                {availableTimes.map((time, index) => (
                  <label
                    key={`${time}-${index}`}
                    className={`flex flex-col items-center p-2 border rounded-md cursor-pointer ${
                      formData.time === time
                        ? 'border-primary bg-primary bg-opacity-5'
                        : 'border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="time"
                      value={time}
                      checked={formData.time === time}
                      onChange={handleChange}
                      className="sr-only"
                    />
                    <Clock className="h-4 w-4 mb-1 text-gray-500" />
                    <span className="text-xs font-medium">{time}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        );

      case 3:
        return (
          <div className="space-y-4">
            <h4 className="text-sm font-medium text-gray-700 mb-2">Motivo de la consulta</h4>
            <textarea
              name="reason"
              value={formData.reason}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent h-32"
              placeholder="Describe brevemente el motivo de tu cita"
            />

            <div className="bg-gray-50 p-4 rounded-lg">
              <h4 className="text-sm font-medium text-gray-800 mb-3">Resumen de la cita</h4>
              <div className="space-y-2">
                <div className="flex items-center">
                  <User className="h-4 w-4 text-gray-500 mr-2" />
                  <p className="text-sm text-gray-700"><strong>Farmacia:</strong> {formData.pharmacyId}</p>
                </div>
                <div className="flex items-center">
                  <Calendar className="h-4 w-4 text-gray-500 mr-2" />
                  <p className="text-sm text-gray-700"><strong>Fecha:</strong> {new Date(formData.date).toLocaleDateString('es-ES')}</p>
                </div>
                <div className="flex items-center">
                  <Clock className="h-4 w-4 text-gray-500 mr-2" />
                  <p className="text-sm text-gray-700"><strong>Hora:</strong> {formData.time}</p>
                </div>
                <div className="flex items-center">
                  <FileText className="h-4 w-4 text-gray-500 mr-2" />
                  <p className="text-sm text-gray-700"><strong>Motivo:</strong> {formData.reason}</p>
                </div>
              </div>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-card p-6">
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-lg font-semibold text-gray-800">Agendar Cita</h3>
        <span className="text-sm text-gray-500">Paso {currentStep} de {totalSteps}</span>
      </div>

      <form onSubmit={handleSubmit}>
        {renderStep()}

        <div className="flex justify-between mt-6">
          <button
            type="button"
            onClick={handleBack}
            disabled={currentStep === 1}
            className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md disabled:opacity-50"
          >
            Atrás
          </button>

          {currentStep < totalSteps ? (
            <button
              type="button"
              onClick={handleNext}
              className="px-4 py-2 bg-primary text-white rounded-md"
            >
              Siguiente
            </button>
          ) : (
            <button
              type="submit"
              className="px-4 py-2 bg-primary text-white rounded-md"
            >
              Confirmar cita
            </button>
          )}
        </div>
      </form>
    </div>
  );
};

export default AppointmentScheduler;
