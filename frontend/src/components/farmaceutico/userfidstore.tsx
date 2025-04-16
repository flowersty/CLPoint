// src/lib/rfidService.ts
import { create } from 'zustand';
import supabase from '../../lib/supabaseClient'; // Asegúrate que la ruta sea correcta

// --- Tipos (Puedes mantenerlos aquí o en un archivo .d.ts global) ---
interface SerialPort { /* ... como antes ... */ }
interface SerialOptions { /* ... como antes ... */ }
// ...otros tipos serial...

interface PatientData {
  id: number | string;
  name: string;
  allergies: string | null;
  tag_rfid: string;
}

// --- Estado del Store ---
interface RfidState {
  port: SerialPort | null;
  reader: ReadableStreamDefaultReader<Uint8Array> | null;
  isConnected: boolean;
  isConnecting: boolean; // Nuevo estado para el proceso de conexión inicial
  lastTagId: string | null;
  patientInfo: PatientData | null;
  isFetchingPatient: boolean;
  connectionError: string | null;
  patientError: string | null;
  keepReading: boolean; // Flag para controlar el bucle interno
  processedTagId: string | null; // Para evitar búsquedas duplicadas

  // --- Acciones ---
  connect: () => Promise<void>;
  // disconnect: () => Promise<void>; // Opcional: mantenerlo internamente si alguna vez se necesita
  _updateState: (partialState: Partial<RfidState>) => void; // Helper interno
  _handleSerialError: (context: string, error: unknown) => void; // Helper errores
}

// --- Variables fuera del estado para referencias persistentes ---
let portRef: SerialPort | null = null;
let readerRef: ReadableStreamDefaultReader<Uint8Array> | null = null;
let readLoopPromise: Promise<void> | null = null;

// --- Creación del Store Zustand ---
const useRfidStore = create<RfidState>((set, get) => ({
  // --- Estado Inicial ---
  port: null,
  reader: null,
  isConnected: false,
  isConnecting: false,
  lastTagId: null,
  patientInfo: null,
  isFetchingPatient: false,
  connectionError: null,
  patientError: null,
  keepReading: false, // Importante: iniciar como false
  processedTagId: null,

  // --- Helper para actualizar estado ---
  _updateState: (partialState) => set(partialState),

  // --- Helper para manejar errores ---
  _handleSerialError: (context, error) => {
    console.error(`Error en ${context}:`, error);
    let message = 'Ocurrió un error desconocido.';
    if (error instanceof Error) {
        if (error.name === 'NotFoundError') message = 'No se seleccionó ningún puerto.';
        else if (error.name === 'InvalidStateError') message = 'El puerto ya está abierto o en estado inválido.';
        else message = error.message;
    }
    set({ connectionError: `${context}: ${message}`, isConnected: false, isConnecting: false, keepReading: false });
    // Intentar limpiar recursos si es posible (sin esperar aquí)
    if (readerRef) { readerRef.cancel().catch(e=>console.error("Err cancelando reader en error", e)); readerRef = null; }
    if (portRef) { portRef.close().catch(e=>console.error("Err cerrando puerto en error", e)); portRef = null; }
    set({ reader: null, port: null }); // Actualizar estado
  },

  // --- Acción: Conectar ---
  connect: async () => {
    const { isConnected, isConnecting, _handleSerialError, _updateState } = get();

    // Prevenir múltiples conexiones o si no hay soporte
    if (isConnected || isConnecting || typeof navigator === 'undefined' || !('serial' in navigator)) {
      if(typeof navigator !== 'undefined' && !('serial' in navigator)) set({ connectionError: 'Web Serial no soportado.' });
      return;
    }

    set({ isConnecting: true, connectionError: null, patientError: null, lastTagId: null, patientInfo: null, processedTagId: null });

    // Si había una ref previa (muy improbable con esta lógica, pero por si acaso)
     if (portRef) {
         try { await portRef.close(); } catch (e) { console.warn("Warn cerrando puerto previo en connect:", e); }
         portRef = null;
         readerRef = null;
     }

    try {
      const serialPort = await navigator.serial.requestPort();
      await serialPort.open({ baudRate: 9600 });
      console.log("Servicio: Puerto abierto.");

      portRef = serialPort; // Guardar en ref externa
      set({ port: serialPort, isConnected: true, isConnecting: false, keepReading: true }); // Actualizar estado

      // Iniciar bucle de lectura (no esperar aquí)
      readLoopPromise = _internalReadLoop(); // Llamar a función interna

    } catch (error) {
      _handleSerialError('Conexión', error);
      portRef = null; // Asegurar limpieza de ref en error
      set({ port: null }); // Limpiar estado también
    }
  },

  // --- Acción: Desconectar (privada o no expuesta si no hay botón) ---
  // Se podría llamar internamente si se detecta un error grave o desconexión física
  /*
  disconnect: async () => {
      const { _updateState } = get();
      console.log("Servicio: Desconectando...");
      _updateState({ keepReading: false, isConnecting: false }); // Señal para detener bucle

      if (readerRef) {
          try { await readerRef.cancel(); console.log("Servicio: Lector cancelado."); } catch(e) { console.error("Err cancelando reader", e); }
          readerRef = null;
      }
      if (readLoopPromise) {
          try { await readLoopPromise; } catch(e) { console.error("Err esperando bucle", e); }
          readLoopPromise = null;
      }
      if (portRef) {
          try { await portRef.close(); console.log("Servicio: Puerto cerrado."); } catch(e) { console.error("Err cerrando puerto", e); }
          portRef = null;
      }
      _updateState({ isConnected: false, port: null, reader: null, lastTagId: null, patientInfo: null, patientError: null, connectionError: null });
      console.log("Servicio: Desconexión completa.");
  },
  */

})); // Fin create()

// --- Lógica Asíncrona Interna (Fuera de las acciones directas del store) ---

// Bucle de Lectura Interno
const _internalReadLoop = async () => {
    const state = useRfidStore.getState(); // Obtener estado y acciones una vez
    const { _updateState, _handleSerialError } = state;

    if (!portRef || !portRef.readable) {
        _handleSerialError('ReadLoop Setup', new Error("Puerto no disponible o no legible."));
        return;
    }

    console.log("Servicio: Iniciando _internalReadLoop...");
    _updateState({ reader: null }); // Resetear lector en estado
    readerRef = null;

    try {
        readerRef = portRef.readable.getReader();
        _updateState({ reader: readerRef }); // Guardar en estado (aunque no se use mucho)
        console.log("Servicio: Lector obtenido.");
    } catch (error) {
        _handleSerialError('Obtener Lector', error);
        return;
    }

    const textDecoder = new TextDecoder();
    let partialData = '';

    try {
        // Usar un bucle while que verifique el estado 'keepReading' del store
        while (useRfidStore.getState().keepReading) {
            const { value, done } = await readerRef.read();

            if (done) {
                console.log("Servicio: Lector cerrado (done=true).");
                _updateState({ keepReading: false }); // Detener bucle si se cierra inesperadamente
                break;
            }

            if (!useRfidStore.getState().keepReading) { // Doble chequeo por si cambió mientras se esperaba read()
                 console.log("Servicio: keepReading cambió a false, saliendo.");
                 break;
            }

            const textChunk = textDecoder.decode(value, { stream: true });
            partialData += textChunk;

            let newlineIndex: number;
            while ((newlineIndex = partialData.indexOf('\n')) !== -1) {
                const line = partialData.substring(0, newlineIndex).trim().replace(/\r$/, '');
                partialData = partialData.substring(newlineIndex + 1);
                if (line) {
                    console.log("Servicio: Tag recibido:", line);
                    // Actualizar lastTagId en el store, esto disparará el efecto secundario de búsqueda
                    const currentLastTag = useRfidStore.getState().lastTagId;
                    if (line !== currentLastTag) { // Solo actualizar si es diferente
                         _updateState({
                             lastTagId: line,
                             patientInfo: null, // Limpiar paciente anterior
                             patientError: null, // Limpiar error anterior
                             isFetchingPatient: true, // Iniciar carga
                             processedTagId: null // Permitir que se procese este nuevo tag
                         });
                    }
                }
            }
        }
    } catch (error) {
        // Solo reportar error si NO fue por una desconexión manual (keepReading = false)
        if (useRfidStore.getState().keepReading) {
             _handleSerialError('Lectura Serial', error);
        } else {
             console.log("Servicio: Error de lectura ignorado (probablemente por desconexión).");
        }
    } finally {
        console.log("Servicio: Finally _internalReadLoop.");
        if (readerRef) {
            // No cancelar aquí si fue una desconexión manual, ya se hizo.
            // Liberar el lock es importante.
             readerRef.releaseLock();
             console.log("Servicio: Lock liberado.");
             readerRef = null;
             _updateState({ reader: null });
        }
    }
     console.log("Servicio: _internalReadLoop terminado.");
     // Si salimos del bucle y no fue por desconexión explícita, ¿qué hacemos?
     // Podríamos intentar reconectar o simplemente marcar como desconectado.
     // Por ahora, si keepReading se puso a false, asumimos que fue intencional o por error manejado.
     if (!useRfidStore.getState().keepReading && useRfidStore.getState().isConnected) {
        // Si el bucle se detuvo pero aún nos consideramos conectados, forzar desconexión lógica.
        // Esto podría pasar si el dispositivo USB se desconecta físicamente.
        console.warn("Servicio: Bucle terminado inesperadamente, forzando estado desconectado.");
         useRfidStore.getState()._handleSerialError("Bucle Inesperado", new Error("El flujo de datos se interrumpió."));
     }
};

// --- Búsqueda en Supabase (Función interna) ---
const _fetchPatientDataInternal = async (tagId: string) => {
     const { _updateState, processedTagId } = useRfidStore.getState();

    // Evitar búsqueda si es el tag ya procesado
     if (tagId === processedTagId) {
         console.log(`Servicio: Tag ${tagId} ya procesado, omitiendo fetch.`);
         _updateState({ isFetchingPatient: false }); // Asegurar que no esté cargando
         return;
     }

     console.log(`Servicio: Buscando paciente con tag: ${tagId}`);
     // Asegurar estado de carga (aunque ya debería estarlo)
     _updateState({ isFetchingPatient: true, patientError: null, patientInfo: null });


    try {
        const { data, error: dbError } = await supabase
            .from('patients')
            .select('id, name, allergies, tag_rfid')
            .eq('tag_rfid', tagId)
            .maybeSingle();

        // IMPORTANTE: Obtener el lastTagId ACTUAL del store antes de actualizar.
        // Si cambió mientras buscábamos, descartamos este resultado.
        const currentTagIdInStore = useRfidStore.getState().lastTagId;

        if (tagId === currentTagIdInStore) {
            if (dbError) {
                console.error('Servicio: Error Supabase:', dbError);
                _updateState({ patientError: `Error DB: ${dbError.message}`, patientInfo: null, processedTagId: tagId });
            } else if (data) {
                console.log('Servicio: Paciente encontrado:', data);
                _updateState({ patientInfo: data as PatientData, patientError: null, processedTagId: tagId });
            } else {
                console.log(`Servicio: Tag ${tagId} no registrado.`);
                _updateState({ patientError: 'Tag RFID no registrado.', patientInfo: null, processedTagId: tagId });
            }
        } else {
            console.log(`Servicio: Resultado para tag ${tagId} descartado (nuevo tag: ${currentTagIdInStore})`);
            // No marcar como procesado si se descartó, permitir que el nuevo tag inicie su fetch
        }

    } catch (error) {
        console.error('Servicio: Error inesperado en fetch Supabase:', error);
         const currentTagIdInStore = useRfidStore.getState().lastTagId;
         if (tagId === currentTagIdInStore) { // Solo setear error si aún es relevante
             _updateState({
                 patientError: `Error inesperado: ${error instanceof Error ? error.message : 'Desconocido'}`,
                 patientInfo: null,
                 processedTagId: tagId // Marcar como procesado aunque haya error
             });
         }
    } finally {
        // Solo detener carga si el tag procesado sigue siendo el último leído
         const currentTagIdInStore = useRfidStore.getState().lastTagId;
         if (tagId === currentTagIdInStore) {
            _updateState({ isFetchingPatient: false });
         }
    }
};

// --- Suscripción para Efecto Secundario: Buscar Paciente cuando cambia lastTagId ---
// Zustand permite suscribirse a cambios y reaccionar fuera de componentes React.
useRfidStore.subscribe(
    (state, prevState) => {
        // Reaccionar solo si lastTagId cambió y es un valor válido (no null)
        if (state.lastTagId && state.lastTagId !== prevState.lastTagId) {
            _fetchPatientDataInternal(state.lastTagId);
        }
    },
    // Opcional: selector para optimizar, solo notificar si lastTagId cambia
    // state => state.lastTagId
);


export default useRfidStore; // Exportar el hook del store