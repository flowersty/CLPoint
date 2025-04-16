import React, { useState, useEffect } from 'react';
import './Doctor_interfaz.css';
import supabase from '../lib/supabaseClient';
import { toast } from 'react-hot-toast';

interface Patient {
  id: string;
  nombre_completo: string;
  tipo_cita: string;
  hora_cita: string;
}

interface Medication {
  id_farmaco: string;
  nombre_medicamento: string;
  dosis?: string;
  frecuencia?: string;
  duracion?: string;
}

const DoctorInterface: React.FC = () => {
  const [currentDate, setCurrentDate] = useState<string>('');
  const [selectedPatient, setSelectedPatient] = useState<string>('');
  const [consultDate, setConsultDate] = useState<string>('');
  const [nextConsultDate, setNextConsultDate] = useState<string>('');
  const [consultReason, setConsultReason] = useState<string>('');
  const [medications, setMedications] = useState<Medication[]>([]);
  const [searchMedication, setSearchMedication] = useState<string>('');
  const [patients, setPatients] = useState<Patient[]>([]);
  const [medicationsList, setMedicationsList] = useState<Medication[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    updateCurrentDate();
    fetchPatients();
    fetchMedications();
  }, []);

  const updateCurrentDate = () => {
    const today = new Date();
    const formattedDate = today.toLocaleDateString('es-ES', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    setCurrentDate(formattedDate);
  };

  const fetchPatients = async () => {
    try {
      const { data, error } = await supabase
        .from('citas')
        .select('id, patients(nombre_completo), tipo_cita, hora_cita')
        .eq('estado', 'pendiente')
        .order('hora_cita', { ascending: true });

      if (error) throw error;

      if (data) {
        const formattedPatients = data.map((item) => ({
          id: item.id,
          nombre_completo: item.patients.nombre_completo,
          tipo_cita: item.tipo_cita,
          hora_cita: item.hora_cita,
        }));
        setPatients(formattedPatients);
      }
    } catch (err) {
      console.error('Error fetching patients:', err);
      setError('Error al cargar los pacientes');
    }
  };

  const fetchMedications = async () => {
    try {
      const { data, error } = await supabase
        .from('medicamentos')
        .select('id_farmaco, nombre_medicamento')
        .order('nombre_medicamento', { ascending: true });

      if (error) throw error;

      if (data) {
        setMedicationsList(data);
      }
    } catch (err) {
      console.error('Error fetching medications:', err);
      setError('Error al cargar los medicamentos');
    } finally {
      setLoading(false);
    }
  };

  const handleAddMedication = () => {
    if (searchMedication.trim() === '') {
      toast.error('Por favor ingrese el nombre del medicamento.');
      return;
    }

    const matchingMed = medicationsList.find((med) =>
      med.nombre_medicamento.toLowerCase().includes(searchMedication.toLowerCase())
    );

    if (matchingMed) {
      const newMedication = {
        id_farmaco: matchingMed.id_farmaco,
        nombre_medicamento: matchingMed.nombre_medicamento,
      };
      setMedications([...medications, newMedication]);
      setSearchMedication('');
    } else {
      toast.error('Medicamento no encontrado. Intente con otro nombre.');
    }
  };

  const handleRemoveMedication = (id_farmaco: string) => {
    const newMedications = medications.filter((med) => med.id_farmaco !== id_farmaco);
    setMedications(newMedications);
  };

  return (
    <div className="doctor-interface">
      {/* Sidebar */}
      <div className="sidebar">
        <div className="sidebar-header">
          <div className="sidebar-title">Interfaz Doctor</div>
        </div>
        <div className="patients-queue">
          <h3 className="queue-title">Pacientes en Espera</h3>
          {loading ? (
            <div>Cargando pacientes...</div>
          ) : error ? (
            <div>{error}</div>
          ) : (
            patients.map((patient, index) => (
              <div key={index} className="patient-item">
                <div className="patient-name">{patient.nombre_completo}</div>
                <div className="patient-info">{patient.tipo_cita} | {patient.hora_cita}</div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="main-content">
        <div className="header">
          <h1>Nueva Receta Médica</h1>
          <div className="current-date">{currentDate}</div>
        </div>

        <div className="prescription-form">
          <h2 className="form-title">Datos de Receta</h2>
          
          <div className="form-row">
            <div className="form-group">
              <label>Paciente:</label>
              <select
                className="form-control"
                value={selectedPatient}
                onChange={(e) => setSelectedPatient(e.target.value)}
              >
                <option value="">Seleccionar Paciente</option>
                {patients.map((patient) => (
                  <option key={patient.id} value={patient.id}>
                    {patient.nombre_completo}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>Fecha de consulta:</label>
              <input
                type="date"
                className="form-control"
                value={consultDate}
                onChange={(e) => setConsultDate(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label>Próxima consulta:</label>
              <input
                type="date"
                className="form-control"
                value={nextConsultDate}
                onChange={(e) => setNextConsultDate(e.target.value)}
              />
            </div>
          </div>
          
          <div className="form-group">
            <label>Motivo de consulta:</label>
            <input
              type="text"
              className="form-control"
              value={consultReason}
              onChange={(e) => setConsultReason(e.target.value)}
            />
          </div>

          <h3 className="section-title">Diagnóstico y Medicamentos</h3>

          <div className="form-group">
            <label>Diagnóstico:</label>
            <textarea className="form-control"></textarea>
          </div>

          <div className="medications-section">
            <h4>Medicamentos:</h4>
            <div className="medication-search">
              <input
                type="text"
                className="form-control"
                placeholder="Buscar medicamento..."
                value={searchMedication}
                onChange={(e) => setSearchMedication(e.target.value)}
              />
              <button type="button" onClick={handleAddMedication}>Agregar</button>
            </div>

            <div className="medications-list">
              {medications.map((med, index) => (
                <div key={index} className="medication-item">
                  <div>{med.nombre_medicamento}</div>
                  <button
                    className="remove-med"
                    onClick={() => handleRemoveMedication(med.id_farmaco)}
                  >
                    Eliminar
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="form-group">
            <label>Indicaciones:</label>
            <textarea className="form-control"></textarea>
          </div>

          <div className="form-actions">
            <button type="button" className="btn btn-secondary">Cancelar</button>
            <button type="button" className="btn btn-primary">Guardar Receta</button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DoctorInterface;
