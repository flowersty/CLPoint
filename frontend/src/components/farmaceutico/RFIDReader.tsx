import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Fingerprint, Loader2, AlertCircle, UserCheck, UserX, Link2, QrCode } from 'lucide-react';
import supabase from '../../lib/supabaseClient';

// Interfaces remain the same...
declare global {
    // ... (SerialPort interfaces remain the same)
}

interface PatientData {
    id: number | string;
    name: string;
    allergies: string | null;
    tag_rfid: string;
    surecode?: string;
    phone?: string;
}

interface RFIDReaderProps {
    onPatientIdentified?: (patient: PatientData) => void;
}

// Global state management (use with caution)
let globalPort: SerialPort | null = null;
let globalReader: ReadableStreamDefaultReader<Uint8Array> | null = null;
let globalKeepReading = true;
let isDisconnectingGlobally = false;

function RFIDReader({ onPatientIdentified }: RFIDReaderProps): JSX.Element {
    // Component State
    const [port, setPort] = useState<SerialPort | null>(globalPort);
    const [isConnected, setIsConnected] = useState<boolean>(!!globalPort);
    const [receivedData, setReceivedData] = useState<string>('');
    const [lastTagId, setLastTagId] = useState<string>('');
    const [error, setError] = useState<string | null>(null);
    const [isFetchingPatient, setIsFetchingPatient] = useState<boolean>(false);
    const [patientError, setPatientError] = useState<string | null>(null);
    const [patientInfo, setPatientInfo] = useState<PatientData | null>(null);
    const [isConnecting, setIsConnecting] = useState<boolean>(false);
    const [isDisconnecting, setIsDisconnecting] = useState<boolean>(false); // Local state for UI feedback

    // Association Mode State
    const [isAssociationMode, setIsAssociationMode] = useState<boolean>(false);
    const [surecode, setSurecode] = useState<string>('');
    const [isAssociating, setIsAssociating] = useState<boolean>(false);
    const [associationError, setAssociationError] = useState<string | null>(null);
    const [associationSuccess, setAssociationSuccess] = useState<boolean>(false);
    const [listeningForAssociation, setListeningForAssociation] = useState<boolean>(false);

    // Refs
    const keepReadingRef = useRef<boolean>(true);
    const readLoopPromiseRef = useRef<Promise<void> | null>(null);
    const portRef = useRef<SerialPort | null>(globalPort);

    // --- Utility Functions ---

    // No dependencies, can be defined anywhere (or outside component)
    const cleanTagId = (rawTag: string): string => {
        // Trim whitespace and normalize spaces
        let cleaned = rawTag.trim().replace(/\s+/g, ' ');
        // Remove any trailing timestamps or metadata (e.g., ":123")
        cleaned = cleaned.replace(/:\d+$/, '');
        console.log(`Cleaned Tag ID: Raw='${rawTag}', Cleaned='${cleaned}'`);
        return cleaned;
    };

    // Use useCallback for helpers that might be dependencies elsewhere or rely on state/props
    const resetPatientState = useCallback(() => {
        setPatientInfo(null);
        setPatientError(null);
        setIsFetchingPatient(false);
        // setLastTagId(''); // Optional based on desired behavior
    }, []); // Empty dependency array - safe

    const resetAssociationState = useCallback(() => {
        setIsAssociationMode(false);
        setSurecode('');
        setAssociationError(null);
        setAssociationSuccess(false);
        setIsAssociating(false);
        setListeningForAssociation(false);
        resetPatientState(); // Depends on resetPatientState
    }, [resetPatientState]); // Add resetPatientState dependency

    // --- Core Logic Functions (Define BEFORE functions that depend on them) ---

    const associateTagToPatient = useCallback(async (tagId: string, patientSurecode: string) => {
        setIsAssociating(true);
        setAssociationError(null);
        setAssociationSuccess(false);
        setPatientInfo(null); // Clear patient info before starting

        const cleanedTagId = tagId; // Already cleaned
        const cleanedSurecode = patientSurecode.trim();

        console.log(`Attempting to associate Tag: ${cleanedTagId} with Surecode: ${cleanedSurecode}`);

        try {
            // 1. Verify Surecode Exists
            console.log("Checking if surecode exists...");
            const { data: existingPatient, error: checkError } = await supabase
                .from('patients')
                .select('surecode, id, name, tag_rfid')
                .eq('surecode', cleanedSurecode)
                .single();

            if (checkError) {
                if (checkError.code === 'PGRST116') {
                    setAssociationError('No existe ningún paciente con este código de fidelización.');
                } else {
                    console.error("Supabase error checking surecode:", checkError);
                    setAssociationError(`Error al verificar código: ${checkError.message}`);
                }
                setIsAssociating(false);
                return;
            }
            // Redundant check, single() handles this with PGRST116
            // if (!existingPatient) { ... }

            // Check if the patient *already* has this tag
            if (existingPatient.tag_rfid === cleanedTagId) {
                setAssociationError(`Este paciente (${existingPatient.name}) ya tiene esta tarjeta RFID asignada.`);
                setAssociationSuccess(false);
                setPatientInfo(existingPatient as PatientData);
                setIsAssociating(false);
                setTimeout(resetAssociationState, 4000); // Pass the function reference
                return;
            }

            console.log("Surecode exists for patient:", existingPatient.name);

            // 2. Verify Tag Isn't Used by *Another* Patient
            console.log("Checking if tag is already in use by another patient...");
            const { data: tagInUse, error: tagError } = await supabase
                .from('patients')
                .select('id, name')
                .eq('tag_rfid', cleanedTagId)
                .not('surecode', 'eq', cleanedSurecode)
                .maybeSingle();

            if (tagError) {
                console.error("Supabase error checking tag usage:", tagError);
                setAssociationError(`Error al verificar tag RFID: ${tagError.message}`);
                setIsAssociating(false);
                return;
            }

            if (tagInUse) {
                console.warn(`Tag ${cleanedTagId} already associated with patient ${tagInUse.name} (ID: ${tagInUse.id})`);
                setAssociationError(`Esta tarjeta ya está asociada a OTRO paciente: ${tagInUse.name || 'ID: ' + tagInUse.id}`);
                setIsAssociating(false);
                return;
            }

            console.log("Tag is available or belongs to the target patient (will be updated).");

            // 3. Update the Patient
            console.log(`Updating patient ${existingPatient.id} with tag ${cleanedTagId}...`);
            const { error: updateError } = await supabase
                .from('patients')
                .update({ tag_rfid: cleanedTagId })
                .eq('surecode', cleanedSurecode);

            if (updateError) {
                console.error("Supabase error updating patient:", updateError);
                setAssociationError(`Error al actualizar: ${updateError.message}`);
                setIsAssociating(false);
                return;
            }

            console.log("Patient update successful.");

            // 4. Fetch Updated Patient Data
            const { data: updatedPatientData, error: fetchUpdatedError } = await supabase
                .from('patients')
                .select('*')
                .eq('surecode', cleanedSurecode)
                .single();

            if (fetchUpdatedError || !updatedPatientData) {
                console.error("Error fetching updated patient data:", fetchUpdatedError);
                setAssociationSuccess(true); // Still show success
            } else {
                setPatientInfo(updatedPatientData as PatientData);
            }

            setAssociationSuccess(true);
            setAssociationError(null);

            setTimeout(resetAssociationState, 3000); // Pass the function reference

        } catch (err) {
            console.error('Critical error associating tag:', err);
            setAssociationError('Error inesperado al asociar tag RFID al paciente.');
        } finally {
            setIsAssociating(false);
            setListeningForAssociation(false);
        }
    }, [resetAssociationState]); // Depends only on resetAssociationState (and implicitly supabase)


    const fetchPatientData = useCallback(async (tagId: string) => {
        console.log(`Fetching patient data for Tag ID: ${tagId}`);
        const cleanedTagId = tagId; // Already cleaned

        setIsFetchingPatient(true); // Set loading state HERE
        setPatientInfo(null);      // Clear previous info
        setPatientError(null);     // Clear previous error


        try {
            const { data, error: fetchError } = await supabase
                .from('patients')
                .select('*')
                .eq('tag_rfid', cleanedTagId)
                .single();

            if (fetchError) {
                if (fetchError.code === 'PGRST116') {
                    console.log(`No patient found with Tag ID: ${cleanedTagId}`);
                    setPatientError('No se encontró ningún paciente con esta tarjeta.');
                } else {
                    console.error('Supabase error fetching patient:', fetchError);
                    setPatientError(`Error al buscar paciente: ${fetchError.message}`);
                }
                // setPatientInfo(null); // Already cleared above
                return;
            }

            if (data) {
                console.log('Patient found:', data);
                const patientData = data as PatientData;
                setPatientInfo(patientData);
                // setPatientError(null); // Already cleared above

                if (onPatientIdentified) {
                    onPatientIdentified(patientData);
                }
            } else {
                console.log(`No patient data returned for Tag ID: ${cleanedTagId}`);
                setPatientError('No se encontró ningún paciente con esta tarjeta.');
                // setPatientInfo(null); // Already cleared above
            }

        } catch (err) {
            console.error('Error fetching patient data:', err);
            setPatientError('Error inesperado al buscar información del paciente.');
            // setPatientInfo(null); // Already cleared above
        } finally {
            setIsFetchingPatient(false); // Hide loading indicator
        }
    }, [onPatientIdentified]); // Depends on onPatientIdentified (and implicitly supabase)


    const handleDisconnect = useCallback(async (internalError = false): Promise<void> => {
        // Make sure resetPatientState and resetAssociationState are defined above
        if (isDisconnecting || isDisconnectingGlobally) {
            console.log("Disconnect already in progress.");
            return;
        }

        console.log("Initiating disconnect...");
        setIsDisconnecting(true);
        isDisconnectingGlobally = true;
        keepReadingRef.current = false;
        globalKeepReading = false;

        const readerToCancel = globalReader;
        if (readerToCancel) {
            console.log("Cancelling reader...");
            try {
                await readerToCancel.cancel();
                console.log("Reader cancelled.");
            } catch (err) {
                console.error("Error cancelling reader:", err);
                 if (!(err instanceof DOMException && err.name === 'NetworkError')) {
                     // Handle or log other errors if necessary
                 }
            } finally {
                try {
                     // Ensure lock release happens even if cancel fails
                     if (readerToCancel) { // Check again as it might be nullified elsewhere
                       readerToCancel.releaseLock();
                       console.log("Reader lock released after cancel attempt.");
                     }
                } catch (lockErr) {
                    if (!(lockErr instanceof Error && lockErr.message.includes("cannot release a released lock"))) {
                        console.error("Error releasing lock after cancel:", lockErr);
                    }
                }
                globalReader = null;
            }
        } else {
            console.log("No active reader to cancel.");
        }

        const currentReadLoop = readLoopPromiseRef.current;
        if (currentReadLoop) {
            console.log("Waiting for read loop to finish...");
            try {
                await currentReadLoop;
                console.log("Read loop finished.");
            } catch (waitErr) {
                console.error("Error waiting for read loop completion:", waitErr);
            } finally {
              readLoopPromiseRef.current = null;
            }
        } else {
             console.log("No active read loop promise to wait for.");
        }

        const portToClose = portRef.current;
        if (portToClose) {
            console.log("Closing port...");
            try {
                await portToClose.close();
                console.log("Port closed.");
            } catch (err) {
                console.error("Error closing port:", err);
                if (!internalError) {
                    setError(`Error al cerrar el puerto: ${err instanceof Error ? err.message : String(err)}`);
                }
            } finally {
                portRef.current = null;
                globalPort = null;
                setPort(null);
            }
        } else {
            console.log("No active port to close.");
            portRef.current = null; // Ensure cleanup even if already null
            globalPort = null;
            setPort(null);
        }

        console.log("Resetting component state after disconnect.");
        setIsConnected(false);
        setLastTagId('');
        setReceivedData('');
        if (!internalError) {
            setError(null);
        }
        // Call reset functions AFTER they are defined
        resetPatientState();
        resetAssociationState();

        setIsDisconnecting(false);
        isDisconnectingGlobally = false;
        console.log("Disconnect finished.");

    }, [isDisconnecting, resetPatientState, resetAssociationState]); // Depends on resetPatientState, resetAssociationState


    // --- Dependent Logic (Depends on Core Logic - Define AFTER Core Logic) ---

    const readLoop = useCallback(async (currentPort: SerialPort): Promise<void> => {
        // Now associateTagToPatient, fetchPatientData, handleDisconnect are guaranteed to be initialized
        if (!currentPort?.readable || !keepReadingRef.current) {
            console.warn("Read loop start condition not met.");
            return;
        }

        let currentReader: ReadableStreamDefaultReader<Uint8Array> | null = null;

        try {
            currentReader = currentPort.readable.getReader();
            globalReader = currentReader;
            console.log("Reader obtained for read loop.");

            const textDecoder = new TextDecoder();
            let partialData = '';

            while (currentPort.readable && keepReadingRef.current) {
                 console.log("Read loop: Waiting for read...");
                try {
                    const { value, done } = await currentReader.read();

                    if (done) {
                        console.log("Read loop: Reader closed (done=true).");
                        keepReadingRef.current = false;
                        break;
                    }

                    if (!keepReadingRef.current) {
                        console.log("Read loop: keepReading became false, exiting.");
                        break;
                    }

                    const textChunk = textDecoder.decode(value, { stream: true });
                    partialData += textChunk;
                    // console.log("Read loop: Received chunk", textChunk, "Partial data now:", partialData);


                    let newlineIndex: number;
                    while ((newlineIndex = partialData.indexOf('\n')) !== -1) {
                        const rawLine = partialData.substring(0, newlineIndex);
                        partialData = partialData.substring(newlineIndex + 1);

                        const line = cleanTagId(rawLine);

                        if (line) {
                            console.log("Read loop: Processing line:", line);
                            setReceivedData(prev => prev + line + '\n');
                            setLastTagId(line);

                            // Read state values directly within the loop's scope IS GENERALLY OKAY
                            // for reading, but be mindful if setting state rapidly relies on previous state
                            if (isAssociationMode && listeningForAssociation && surecode) {
                                console.log("Read loop: Association path triggered.");
                                setListeningForAssociation(false); // Stop listening immediately
                                // Now associateTagToPatient is defined
                                await associateTagToPatient(line, surecode);
                            } else if (!isAssociationMode) {
                                console.log("Read loop: Identification path triggered.");
                                resetPatientState(); // Clear previous patient info
                                // setIsFetchingPatient(true); // fetchPatientData handles this now
                                // Now fetchPatientData is defined
                                await fetchPatientData(line);
                            } else {
                                console.log("Read loop: Tag received but ignored (Association Mode inactive/not listening).");
                            }
                        } else {
                             console.log("Read loop: Empty line after cleaning, skipping.");
                        }
                    }
                } catch (readError) {
                    if (keepReadingRef.current) {
                        console.error("Read loop: Error during read:", readError);
                        setError(`Error de lectura: ${readError instanceof Error ? readError.message : String(readError)}`);
                        keepReadingRef.current = false;
                         // Now handleDisconnect is defined
                        await handleDisconnect(true); // Pass true to indicate it's from an internal error
                    } else {
                        console.log("Read loop: Read cancelled deliberately.");
                    }
                    break;
                }
            }
        } catch (err) {
            console.error("Read loop: Error setting up reader:", err);
            if (keepReadingRef.current && err instanceof Error && err.name !== 'NetworkError' && err.name !== 'BreakError') {
                setError(`Error de configuración de lectura: ${err.message}`);
            }
        } finally {
            console.log("Read loop: Finalizing.");
            if (currentReader) {
                try {
                    if (keepReadingRef.current) {
                        // Check if the port is still readable before releasing lock - avoids errors on closed ports
                        if (currentPort.readable) {
                             currentReader.releaseLock();
                             console.log("Read loop: Reader lock released in finally.");
                        } else {
                            console.log("Read loop: Port not readable, skipping lock release.");
                        }
                    } else {
                        console.log("Read loop: Skipping lock release in finally as cancellation was requested.");
                    }
                } catch (lockErr) {
                    if (!(lockErr instanceof Error && (lockErr.message.includes("cannot release a released lock") || lockErr.message.includes("The lock is already released")))) {
                         console.error("Read loop: Error releasing reader lock in finally:", lockErr);
                    }
                }
            }
            // Avoid setting globalReader to null if disconnect is handling it
            // globalReader = null; // Let handleDisconnect manage this
            console.log("Read loop: Finished.");
        }
    }, [resetPatientState, isAssociationMode, listeningForAssociation, surecode, associateTagToPatient, fetchPatientData, handleDisconnect]); // Keep dependencies

    const handleConnect = useCallback(async (): Promise<void> => {
        // Now readLoop, resetPatientState, resetAssociationState are defined
        if (isConnecting || isDisconnecting || isDisconnectingGlobally) {
            setError('Operación de conexión/desconexión en curso.');
            return;
        }
        if (globalPort) {
            console.log("Connecting using existing global port.");
            setPort(globalPort);
            portRef.current = globalPort;
            setIsConnected(true);
            keepReadingRef.current = true;
            globalKeepReading = true;
            setError(null);
            if (!readLoopPromiseRef.current && globalPort.readable) { // Check readable status
                 readLoopPromiseRef.current = readLoop(globalPort).finally(() => {
                     readLoopPromiseRef.current = null;
                 });
            } else if (globalPort.readable) {
                 console.log("Read loop potentially already running or starting.");
            } else {
                console.warn("Existing global port is not readable. Disconnecting.");
                await handleDisconnect(true); // Force disconnect if port unusable
            }
            return;
        }

        if (typeof navigator === 'undefined' || !('serial' in navigator)) {
            setError('Tu navegador no soporta la Web Serial API. Usa Chrome, Edge u Opera.');
            return;
        }

        setIsConnecting(true);
        setError(null);
        resetPatientState();
        resetAssociationState();

        try {
            console.log("Requesting serial port...");
            const serialPort = await navigator.serial.requestPort();
            console.log("Port obtained, opening...");
            await serialPort.open({ baudRate: 9600 });
            console.log("Port opened.");

            globalPort = serialPort;
            portRef.current = serialPort;
            keepReadingRef.current = true;
            globalKeepReading = true;

            setPort(serialPort);
            setIsConnected(true);

            // Start the read loop
            readLoopPromiseRef.current = readLoop(serialPort).finally(() => {
                readLoopPromiseRef.current = null;
            });

        } catch (err) {
            console.error("Error connecting:", err);
            const message = err instanceof Error ? err.message : String(err);
            if (message.includes("No port selected") || message.includes("The user aborted a request")) {
                setError("No se seleccionó ningún puerto.");
            } else {
                setError(`Error al conectar: ${message}`);
            }
            setIsConnected(false);
            setPort(null);
            portRef.current = null;
            globalPort = null;
        } finally {
             setIsConnecting(false);
        }
    }, [isConnecting, isDisconnecting, resetPatientState, resetAssociationState, readLoop, handleDisconnect]); // Added handleDisconnect dependency

    const handleStartAssociation = useCallback(() => {
        // Now resetPatientState is defined
        if (!surecode.trim()) {
            setAssociationError('Por favor ingrese un código de fidelización válido');
            return;
        }
        setAssociationError(null);
        setAssociationSuccess(false);
        resetPatientState(); // Clear patient info when starting association
        setPatientError(null);
        setListeningForAssociation(true);
        console.log("Starting association listener for surecode:", surecode);
    }, [surecode, resetPatientState]); // Added resetPatientState dependency

    // --- Effects ---

    // Effect to sync component state if global port changes externally
    useEffect(() => {
        // Check if the global port reference is different from the component's ref
        if (globalPort !== portRef.current) {
            console.log("Global port state change detected, syncing component state.");
            const currentGlobalPort = globalPort; // Capture for stable reference
            setPort(currentGlobalPort);
            portRef.current = currentGlobalPort;
            setIsConnected(!!currentGlobalPort);

            if (!currentGlobalPort) {
                // Global port disconnected externally
                keepReadingRef.current = false; // Stop reading intent
                if (!isDisconnectingGlobally) { // Avoid triggering reset if already disconnecting
                   resetPatientState();
                   resetAssociationState();
                   setReceivedData('');
                   setError(null); // Clear local error if disconnected externally
                }
            } else {
                 // Global port connected externally
                 keepReadingRef.current = true;
                 globalKeepReading = true; // Ensure global flag is synced
                 // Attempt to start read loop if port is readable and loop isn't running
                 if (currentGlobalPort.readable && !readLoopPromiseRef.current) {
                     console.log("Starting read loop due to external connection sync.");
                      readLoopPromiseRef.current = readLoop(currentGlobalPort).finally(() => {
                           readLoopPromiseRef.current = null;
                      });
                 } else if (!currentGlobalPort.readable) {
                    console.warn("Externally connected port is not readable.");
                    // Consider triggering disconnect? Or wait for user action?
                 }
            }
        }
        // This effect should ideally react to the *concept* of the global state changing,
        // which is hard without a proper global state manager. Running it once might
        // catch initial mismatch, but won't react to later external changes well.
        // Consider a Context or Zustand for better global state handling.
    }, []); // Run once on mount


    // Cleanup effect
    useEffect(() => {
        // const isConnectedOnMount = !!globalPort;
        return () => {
            console.log("RFIDReader component unmounting.");
            // Decide on unmount behavior. Current globals mean connection persists.
            // If disconnect is desired:
            // if (portRef.current && !isDisconnectingGlobally) { // Check ref and global flag
            //    console.log("Attempting disconnect on unmount...");
            //    handleDisconnect(); // Call the memoized disconnect function
            // }
        };
        // }, [handleDisconnect]); // Add handleDisconnect if using it in cleanup
    }, []); // Empty array: run only on mount/unmount


    // --- Render ---
    // (JSX remains the same as the previous version)
    return (
        <div className="p-6 max-w-md mx-auto bg-white rounded-xl shadow-md space-y-4">
            {/* Connection Status & Controls */}
            <div className="p-3 border rounded bg-gray-50 flex flex-col sm:flex-row justify-between items-center gap-3">
                 <p className="text-sm font-medium text-gray-600">
                    Lector:
                    <span className={`ml-2 font-bold ${isConnected ? 'text-green-600' : 'text-red-600'}`}>
                        {isConnecting ? 'Conectando...' : isDisconnecting ? 'Desconectando...' : isConnected ? 'Conectado' : 'Desconectado'}
                    </span>
                </p>
                <div className="flex gap-2 flex-wrap justify-center">
                    {!isConnected ? (
                        <button
                        onClick={handleConnect}
                        className="w-full sm:w-auto px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-300 disabled:opacity-50 text-sm whitespace-nowrap"
                        disabled={isConnecting || isDisconnecting || (typeof navigator !== 'undefined' && !('serial' in navigator))}
                        >
                        {isConnecting && <Loader2 className="inline w-4 h-4 mr-2 animate-spin" />}
                        {isConnecting ? 'Conectando...' : (typeof navigator !== 'undefined' && 'serial' in navigator) ? 'Conectar Lector' : 'No Soportado'}
                        </button>
                    ) : (
                        <>
                        <button
                            onClick={() => handleDisconnect()}
                            className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 focus:outline-none focus:ring-2 focus:ring-red-300 text-sm whitespace-nowrap"
                            disabled={isDisconnecting || isConnecting}
                        >
                            {isDisconnecting && <Loader2 className="inline w-4 h-4 mr-2 animate-spin" />}
                            {isDisconnecting ? 'Desconectando...' : 'Desconectar'}
                        </button>

                        {!isAssociationMode ? (
                            <button
                            onClick={() => setIsAssociationMode(true)}
                            className="px-4 py-2 bg-cyan-600 text-white rounded hover:bg-cyan-700 focus:outline-none focus:ring-2 focus:ring-cyan-300 text-sm flex items-center gap-1 whitespace-nowrap"
                            disabled={isDisconnecting || isConnecting}
                            >
                            <Link2 className="h-4 w-4" />
                            <span>Asociar Tarjeta</span>
                            </button>
                        ) : (
                            <button
                                onClick={resetAssociationState}
                                className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-300 text-sm whitespace-nowrap"
                                disabled={isAssociating || isDisconnecting || isConnecting}
                                title="Cancelar modo asociación"
                            >
                                ✕ Cancelar Asociación
                            </button>
                        )}
                        </>
                    )}
                </div>
            </div>

            {/* Reader Error Display */}
            {error && (
                <div className="mt-4 p-3 border border-red-300 bg-red-100 text-red-700 rounded flex items-center gap-2" role="alert">
                <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0" />
                <div>
                    <p className="font-semibold">Error de Lector:</p>
                    <p className="text-sm">{error}</p>
                </div>
                <button onClick={() => setError(null)} className="ml-auto text-red-600 hover:text-red-800 text-xl">×</button>
                </div>
            )}

            {/* Association Mode UI */}
            {isConnected && isAssociationMode && (
                <div className="mt-4 p-4 border border-cyan-200 bg-cyan-50 rounded-lg">
                <h3 className="text-lg font-semibold text-cyan-800 flex items-center gap-2 mb-4">
                    <Link2 className="h-5 w-5 text-cyan-600" /> Modo Asociación RFID
                </h3>

                <div className="space-y-4">
                    {/* Step 1: Enter Surecode */}
                    {!listeningForAssociation && !associationSuccess && !isAssociating && (
                        <div>
                        <label htmlFor="surecode" className="block text-sm font-medium text-gray-700 mb-1">
                        Código de Fidelización (Surecode)
                        </label>
                        <div className="flex items-center gap-2">
                        <div className="relative flex-grow">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <QrCode className="h-5 w-5 text-gray-400" />
                            </div>
                            <input
                            type="text"
                            id="surecode"
                            value={surecode}
                            onChange={(e) => { setSurecode(e.target.value); setAssociationError(null); }}
                            placeholder="Ingrese código del paciente"
                            className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-cyan-500 focus:border-cyan-500 disabled:bg-gray-100"
                            disabled={isAssociating}
                            aria-describedby="surecode-help"
                            />
                        </div>
                        <button
                            onClick={handleStartAssociation}
                            disabled={!surecode.trim() || isAssociating}
                            className="px-4 py-2 bg-cyan-600 text-white rounded hover:bg-cyan-700 focus:outline-none focus:ring-2 focus:ring-cyan-300 disabled:opacity-50 text-sm flex-shrink-0 flex items-center gap-2"
                        >
                            <Fingerprint className="h-4 w-4" />
                            <span>Escanear Tarjeta</span>
                        </button>
                        </div>
                        <p id="surecode-help" className="mt-1 text-xs text-gray-500">Ingrese el código y presione 'Escanear Tarjeta'.</p>
                    </div>
                    )}

                    {/* Step 2: Waiting for Tag */}
                    {listeningForAssociation && !isAssociating && (
                    <div className="bg-yellow-50 border border-yellow-200 rounded-md p-3 text-center flex items-center justify-center gap-2">
                        <Loader2 className="h-4 w-4 text-yellow-600 animate-spin" />
                        <p className="text-sm text-yellow-700 font-medium">
                        Acerque la tarjeta RFID al lector...
                        </p>
                    </div>
                    )}

                    {/* Loading state during association */}
                    {isAssociating && (
                    <div className="flex justify-center items-center py-4 gap-2 text-cyan-600">
                        <Loader2 className="h-6 w-6 animate-spin" />
                        <span>Asociando tarjeta con surecode <span className="font-mono bg-cyan-100 px-1 rounded">{surecode}</span>...</span>
                    </div>
                    )}

                    {/* Association Result Messages */}
                    {associationError && !isAssociating && (
                    <div className="p-3 border border-red-300 bg-red-100 text-red-700 rounded-md flex items-center gap-2">
                        <AlertCircle className="h-5 w-5 flex-shrink-0"/>
                        <p className="text-sm">{associationError}</p>
                        <button onClick={() => setAssociationError(null)} className="ml-auto text-red-600 hover:text-red-800 text-xl">×</button>
                    </div>
                    )}

                    {associationSuccess && !isAssociating && patientInfo && (
                    <div className="p-3 border border-green-300 bg-green-100 text-green-700 rounded-md">
                        <p className="text-sm font-medium flex items-center gap-2"><UserCheck className="h-5 w-5"/> ¡Tarjeta RFID asociada correctamente!</p>
                        <p className="text-xs mt-1 pl-7">Paciente: {patientInfo.name} (ID: {patientInfo.id})</p>
                        <p className="text-xs mt-1 pl-7">Tag RFID: <span className="font-mono bg-green-200 px-1 rounded">{patientInfo.tag_rfid}</span></p>
                    </div>
                    )}
                </div>
                </div>
            )}

             {/* Identification Area */}
            <div className="mt-5 pt-4 border-t">
                <h3 className="text-lg font-semibold text-gray-800 flex items-center justify-center gap-2 mb-4">
                <Fingerprint className={`h-5 w-5 ${isAssociationMode ? 'text-gray-400' : 'text-blue-600'}`} />
                RFID LECTOR POWERED BY CYNOSURE
                </h3>

                <div className="min-h-[150px] flex items-center justify-center p-4 bg-gray-50 rounded-lg border border-gray-200">
                {/* Display logic based on state */}
                {!isConnected ? (
                    <InfoBox message="Lector no conectado." details="Presione 'Conectar Lector' para empezar." icon={AlertCircle} color="gray" />
                ) : isAssociationMode && !isAssociating ? ( // Show association mode message only if not actively associating
                    <InfoBox message="Modo Asociación Activo" details="Salga del modo asociación para identificar pacientes." icon={Link2} color="cyan" />
                ) : isFetchingPatient ? (
                    <InfoBox message="Buscando paciente..." details={lastTagId ? `Tag RFID: ${lastTagId}` : ''} icon={Loader2} color="blue" spinning />
                ) : isAssociating ? ( // Show associating message here if needed, overlaps with the one above
                    <InfoBox message="Asociando tarjeta..." details={`Surecode: ${surecode}`} icon={Loader2} color="cyan" spinning />
                ) : patientError ? (
                    <InfoBox message="Paciente No Encontrado" details={patientError} lastTag={lastTagId} icon={UserX} color="yellow" />
                ) : patientInfo ? (
                    <PatientInfoCard patient={patientInfo} />
                ) : (
                    <InfoBox message="Esperando Tarjeta RFID..." details="Acerque una tarjeta al lector." icon={Fingerprint} color="gray" animated />
                )}
                </div>
            </div>

             {/* Raw Data Output */}
            <div className="mt-4">
                <details className="group">
                <summary className="text-xs font-medium text-gray-500 hover:text-gray-700 cursor-pointer list-none flex justify-between items-center">
                    <span>Mostrar/Ocultar Datos Raw</span>
                    <span className="group-open:rotate-180 transition-transform duration-200">▼</span>
                </summary>
                <textarea
                    id="rawOutput"
                    aria-label="Datos Raw del Puerto Serial"
                    rows={6}
                    readOnly
                    value={receivedData || "Sin datos recibidos."}
                    className="mt-2 w-full p-2 border rounded bg-gray-100 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-indigo-300"
                    placeholder="Datos del puerto serial aparecerán aquí..."
                />
                </details>
            </div>
        </div>
    );

}

// --- Helper Components ---
// InfoBox and PatientInfoCard remain the same as the previous version

interface InfoBoxProps {
    message: string;
    details?: string;
    lastTag?: string;
    icon: React.ElementType;
    color: 'gray' | 'blue' | 'yellow' | 'cyan';
    spinning?: boolean;
    animated?: boolean; // For the waiting ping
}

const InfoBox: React.FC<InfoBoxProps> = ({ message, details, lastTag, icon: Icon, color, spinning, animated }) => {
    const colorClasses = {
      gray: { text: 'text-gray-600', border: 'border-gray-300', bg: 'bg-gray-100', icon: 'text-gray-500', ping: 'bg-gray-400' },
      blue: { text: 'text-blue-700', border: 'border-blue-200', bg: 'bg-blue-50', icon: 'text-blue-500', ping: 'bg-blue-400' },
      yellow: { text: 'text-yellow-800', border: 'border-yellow-300', bg: 'bg-yellow-50', icon: 'text-yellow-600', ping: '' },
      cyan: { text: 'text-cyan-700', border: 'border-cyan-200', bg: 'bg-cyan-50', icon: 'text-cyan-600', ping: '' },
    };
    const C = colorClasses[color];

    return (
      <div className={`py-10 px-6 ${C.bg} rounded-lg border ${C.border} ${animated ? 'border-dashed' : ''} flex flex-col items-center text-center w-full`}>
        {animated ? (
            <div className="relative flex h-5 w-5 mb-3 text-blue-500">
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${C.ping} opacity-75`}></span>
              <span className={`relative inline-flex rounded-full h-5 w-5 ${C.ping.replace('400', '500')}`}></span>
            </div>
         ) : (
           <Icon className={`h-8 w-8 ${C.icon} mb-3 ${spinning ? 'animate-spin' : ''}`} />
        )}

        <p className={`${C.text} font-semibold`}>{message}</p>
        {details && <p className={`text-sm ${C.text} opacity-90 mt-1`}>{details}</p>}
        {lastTag && <p className="text-xs text-gray-500 mt-2 font-mono">Último tag leído: {lastTag}</p>}
      </div>
    );
};

interface PatientInfoCardProps {
    patient: PatientData;
}

const PatientInfoCard: React.FC<PatientInfoCardProps> = ({ patient }) => (
    <div className="w-full py-6 px-6 bg-green-50 rounded-lg border border-green-300 flex flex-col items-start text-left space-y-3">
        <div className="flex items-center gap-3 w-full border-b pb-2 border-green-200">
        <UserCheck className="h-6 w-6 text-green-600 flex-shrink-0" />
        <h4 className="text-lg font-semibold text-green-800">Paciente Identificado</h4>
        </div>
        <div>
        <p className="text-sm font-medium text-gray-600">Nombre:</p>
        <p className="text-base text-gray-900 font-semibold">{patient.name}</p>
        </div>
        <div>
        <p className="text-sm font-medium text-gray-600">Alergias:</p>
        <p className={`text-base ${patient.allergies ? 'text-red-700 font-medium' : 'text-gray-700'}`}>
            {patient.allergies || 'Ninguna registrada'}
        </p>
        </div>
        <div className="flex gap-4 pt-2">
        <div>
            <p className="text-xs font-medium text-gray-500">Tag RFID:</p>
            <p className="text-xs text-gray-700 font-mono bg-green-100 px-1 rounded">{patient.tag_rfid}</p>
        </div>
        {patient.surecode && (
            <div>
            <p className="text-xs font-medium text-gray-500">Surecode:</p>
            <p className="text-xs text-gray-700 font-mono bg-green-100 px-1 rounded">{patient.surecode}</p>
            </div>
        )}
        </div>
    </div>
);

export default RFIDReader;

const cleanTagId = (rawTag: string): string => {
  const cleanTagId = (rawTag: string): string => {
    // Trim whitespace and normalize spaces
    let cleaned = rawTag.trim().replace(/\s+/g, ' ');
    // Remove any trailing timestamps or metadata (e.g., ":123")
    cleaned = cleaned.replace(/:\d+$/, '');
    console.log(`Cleaned Tag ID: Raw='${rawTag}', Cleaned='${cleaned}'`);
    return cleaned;
  };
  return rawTag.trim().replace(/\s+/g, ''); // Remove all whitespace
};

const fetchPatientByTagId = async (tagId: string) => {
  try {
    const cleanedTag = cleanTagId(tagId);
    const encodedTag = encodeURIComponent(cleanedTag);
    
    const { data, error } = await supabase
      .from('patients')
      .select('*')
      .eq('tag_rfid', cleanedTag);

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error fetching patient:', error);
    throw error;
  }
};