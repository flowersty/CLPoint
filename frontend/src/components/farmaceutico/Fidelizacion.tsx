"use client"

import type React from "react"

import { useState, useRef, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { CreditCard, Camera, QrCode, Search, User, Phone, AlertTriangle, X, Check, Loader2 } from "lucide-react"
import supabase from "../../lib/supabaseClient"

interface FidelizacionProps {
  activeTab: string
  setActiveTab: (tab: string) => void
}

interface Patient {
  id: string
  name: string
  surecode: string
  phone: string
  allergies: string
  [key: string]: any
}

const Fidelizacion: React.FC<FidelizacionProps> = ({ activeTab, setActiveTab }) => {
  // State for identification method tabs
  const [activeMethod, setActiveMethod] = useState<string>("rfid")

  // State for barcode/QR search
  const [searchQuery, setSearchQuery] = useState<string>("")
  const [isSearching, setIsSearching] = useState<boolean>(false)
  const [searchError, setSearchError] = useState<string | null>(null)

  // State for patient data
  const [patientData, setPatientData] = useState<Patient | null>(null)

  // State for camera
  const [showCamera, setShowCamera] = useState<boolean>(false)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [isCameraLoading, setIsCameraLoading] = useState<boolean>(false)

  // Handle identification method change
  const handleIdentificationMethod = (method: string): void => {
    setActiveMethod(method)
    resetSearch()

    if (method !== "facial" && showCamera) {
      stopCamera()
      setShowCamera(false)
    }
  }

  // Reset search state
  const resetSearch = (): void => {
    setSearchQuery("")
    setPatientData(null)
    setSearchError(null)
  }

  // Handle search form submission
  const handleSearch = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()

    if (!searchQuery.trim()) {
      setSearchError("Por favor ingrese un código para buscar")
      return
    }

    setIsSearching(true)
    setSearchError(null)
    setPatientData(null)

    try {
      // Search for patient in the database using surecode
      const { data, error } = await supabase.from("patients").select("*").eq("surecode", searchQuery).single()

      if (error) {
        if (error.code === "PGRST116") {
          setSearchError("No se encontró ningún paciente con ese código")
        } else {
          setSearchError("Error al buscar paciente: " + error.message)
        }
        setPatientData(null)
      } else if (data) {
        setPatientData(data as Patient)
        setSearchError(null)
      }
    } catch (err) {
      console.error("Error searching for patient:", err)
      setSearchError("Error al buscar paciente")
    } finally {
      setIsSearching(false)
    }
  }

  // Camera functions
  const startCamera = async (): Promise<void> => {
    setIsCameraLoading(true)
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
      })

      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream
      }

      setStream(mediaStream)
    } catch (err) {
      console.error("Error accessing camera:", err)
      setSearchError("No se pudo acceder a la cámara")
    } finally {
      setIsCameraLoading(false)
    }
  }

  const stopCamera = (): void => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop())
      setStream(null)
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
  }

  // Cleanup camera on unmount
  useEffect(() => {
    return () => {
      if (showCamera) {
        stopCamera()
      }
    }
  }, [showCamera])

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 p-4 sm:p-6">
      <div className="max-w-5xl mx-auto">
        <header className="mb-8">
          <h1 className="text-3xl font-bold text-gray-800">Fidelización de Pacientes</h1>
          <p className="mt-2 text-gray-600">Identifique a sus pacientes y gestione su información</p>
        </header>

        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          {/* Identification Method Tabs */}
          <div className="border-b border-gray-200">
            <div className="flex overflow-x-auto scrollbar-hide">
              <button
                className={`flex items-center px-6 py-4 border-b-2 font-medium text-sm transition-colors ${
                  activeMethod === "rfid"
                    ? "border-blue-600 text-blue-600"
                    : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                }`}
                onClick={() => handleIdentificationMethod("rfid")}
              >
                <CreditCard className="h-5 w-5 mr-2" />
                <span>Tarjeta RFID</span>
              </button>

              <button
                className={`flex items-center px-6 py-4 border-b-2 font-medium text-sm transition-colors ${
                  activeMethod === "facial"
                    ? "border-blue-600 text-blue-600"
                    : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                }`}
                onClick={() => handleIdentificationMethod("facial")}
              >
                <Camera className="h-5 w-5 mr-2" />
                <span>Reconocimiento Facial</span>
              </button>

              <button
                className={`flex items-center px-6 py-4 border-b-2 font-medium text-sm transition-colors ${
                  activeMethod === "barcode"
                    ? "border-blue-600 text-blue-600"
                    : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                }`}
                onClick={() => handleIdentificationMethod("barcode")}
              >
                <QrCode className="h-5 w-5 mr-2" />
                <span>Código de Barras/QR</span>
              </button>
            </div>
          </div>

          <div className="p-6">
            <AnimatePresence mode="wait">
              {/* RFID Identification */}
              {activeMethod === "rfid" && (
                <motion.div
                  key="rfid"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.3 }}
                  className="space-y-6"
                >
                  <div className="bg-gray-50 rounded-xl border border-gray-200 p-8">
                    <div className="text-center max-w-md mx-auto">
                      <div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-6">
                        <CreditCard className="h-10 w-10 text-blue-600" />
                      </div>

                      <h2 className="text-xl font-semibold text-gray-800 mb-2">Identificación por RFID</h2>
                      <p className="text-gray-600 mb-8">
                        Acerque la tarjeta RFID del paciente al lector para identificarlo automáticamente.
                      </p>

                      <div className="relative">
                        <div className="h-16 rounded-lg border-2 border-gray-300 bg-white flex items-center justify-center transition-colors">
                          <span className="text-gray-500 flex items-center">
                            <span className="relative flex h-3 w-3 mr-2">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                              <span className="relative inline-flex rounded-full h-3 w-3 bg-blue-500"></span>
                            </span>
                            Esperando tarjeta RFID...
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}

              {/* Facial Recognition */}
              {activeMethod === "facial" && (
                <motion.div
                  key="facial"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.3 }}
                  className="space-y-6"
                >
                  <div className="bg-gray-50 rounded-xl border border-gray-200 p-8">
                    <div className="text-center max-w-md mx-auto">
                      <div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-6">
                        <Camera className="h-10 w-10 text-blue-600" />
                      </div>

                      <h2 className="text-xl font-semibold text-gray-800 mb-2">Reconocimiento Facial</h2>
                      <p className="text-gray-600 mb-8">
                        Utilice la cámara para identificar al paciente mediante reconocimiento facial.
                      </p>

                      <div className="relative rounded-xl overflow-hidden bg-gray-900 aspect-video max-w-md mx-auto">
                        {!showCamera ? (
                          <div className="absolute inset-0 flex items-center justify-center">
                            <Camera className="h-16 w-16 text-gray-400 opacity-50" />
                          </div>
                        ) : isCameraLoading ? (
                          <div className="absolute inset-0 flex items-center justify-center">
                            <Loader2 className="h-10 w-10 text-blue-500 animate-spin" />
                          </div>
                        ) : (
                          <>
                            <video
                              ref={videoRef}
                              autoPlay
                              playsInline
                              muted
                              className="w-full h-full object-cover"
                              style={{ display: "block" }}
                            ></video>
                            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                              <div className="w-48 h-48 border-2 border-blue-400 rounded-full opacity-70"></div>
                            </div>
                          </>
                        )}
                      </div>

                      <div className="mt-6 flex justify-center gap-3">
                        {!showCamera ? (
                          <button
                            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
                            onClick={() => {
                              setShowCamera(true)
                              startCamera()
                            }}
                          >
                            <Camera className="h-5 w-5" />
                            <span>Activar Cámara</span>
                          </button>
                        ) : (
                          <>
                            <button
                              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors flex items-center gap-2"
                              onClick={() => {
                                stopCamera()
                                setShowCamera(false)
                              }}
                            >
                              <X className="h-5 w-5" />
                              <span>Detener Cámara</span>
                            </button>

                            <button className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2">
                              <Check className="h-5 w-5" />
                              <span>Capturar e Identificar</span>
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}

              {/* Barcode/QR Code */}
              {activeMethod === "barcode" && (
                <motion.div
                  key="barcode"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.3 }}
                  className="space-y-6"
                >
                  <div className="bg-gray-50 rounded-xl border border-gray-200 p-8">
                    <div className="text-center max-w-md mx-auto">
                      <div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-6">
                        <QrCode className="h-10 w-10 text-blue-600" />
                      </div>

                      <h2 className="text-xl font-semibold text-gray-800 mb-2">Código de Barras / QR</h2>
                      <p className="text-gray-600 mb-6">
                        Escanee el código de barras o QR del paciente, o ingrese el código manualmente.
                      </p>

                      <form onSubmit={handleSearch} className="mb-6">
                        <div className="relative">
                          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <Search className="h-5 w-5 text-gray-400" />
                          </div>

                          <input
                            type="text"
                            placeholder="Escanee o ingrese el código del paciente..."
                            className="block w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            disabled={isSearching}
                          />

                          <div className="absolute inset-y-0 right-0 flex items-center pr-2">
                            <button
                              type="submit"
                              className={`px-4 py-1.5 rounded-lg text-white transition-colors ${
                                isSearching ? "bg-gray-400 cursor-not-allowed" : "bg-blue-600 hover:bg-blue-700"
                              }`}
                              disabled={isSearching}
                            >
                              {isSearching ? (
                                <span className="flex items-center">
                                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                                  Buscando...
                                </span>
                              ) : (
                                <span>Buscar</span>
                              )}
                            </button>
                          </div>
                        </div>

                        {searchError && (
                          <div className="mt-3 text-red-600 text-sm flex items-center justify-center">
                            <AlertTriangle className="h-4 w-4 mr-1" />
                            <span>{searchError}</span>
                          </div>
                        )}
                      </form>

                      <div className="text-sm text-gray-500">
                        <p>
                          Puede escanear el código con un lector de códigos de barras o ingresar el código manualmente.
                        </p>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Patient Information Card */}
            <AnimatePresence>
              {patientData && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 20 }}
                  transition={{ duration: 0.3 }}
                  className="mt-8"
                >
                  <div className="bg-white rounded-xl border border-green-200 shadow-sm overflow-hidden">
                    <div className="bg-green-50 px-6 py-4 border-b border-green-100 flex justify-between items-center">
                      <h3 className="text-lg font-semibold text-green-800 flex items-center">
                        <Check className="h-5 w-5 mr-2 text-green-600" />
                        Paciente Identificado
                      </h3>

                      <button
                        onClick={() => setPatientData(null)}
                        className="p-1.5 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100"
                      >
                        <X className="h-5 w-5" />
                      </button>
                    </div>

                    <div className="p-6">
                      <div className="flex flex-col md:flex-row gap-6">
                        <div className="md:w-1/4 flex flex-col items-center">
                          <div className="w-32 h-32 bg-gray-200 rounded-full flex items-center justify-center mb-3">
                            <User className="h-16 w-16 text-gray-400" />
                          </div>

                          <span className="text-sm text-gray-500">ID: {patientData.id}</span>
                          <span className="text-sm text-gray-500">Código: {patientData.surecode}</span>
                        </div>

                        <div className="md:w-3/4 space-y-4">
                          <div>
                            <h4 className="text-sm font-medium text-gray-500">Nombre</h4>
                            <p className="text-lg font-semibold text-gray-800">{patientData.name}</p>
                          </div>

                          <div>
                            <h4 className="text-sm font-medium text-gray-500">Teléfono</h4>
                            <p className="text-lg font-semibold text-gray-800 flex items-center">
                              <Phone className="h-4 w-4 mr-2 text-gray-400" />
                              {patientData.phone}
                            </p>
                          </div>

                          <div>
                            <h4 className="text-sm font-medium text-gray-500">Alergias</h4>
                            <div className="mt-1">
                              {patientData.allergies ? (
                                <div className="flex flex-wrap gap-2">
                                  {patientData.allergies.split(",").map((allergy, index) => (
                                    <span
                                      key={index}
                                      className="px-3 py-1 bg-red-50 text-red-700 rounded-full text-sm border border-red-100"
                                    >
                                      {allergy.trim()}
                                    </span>
                                  ))}
                                </div>
                              ) : (
                                <p className="text-gray-600">No se han registrado alergias</p>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="mt-8 flex justify-end gap-3">
                        <button className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors">
                          Ver Historial
                        </button>

                        <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
                          Continuar
                        </button>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Fidelizacion

