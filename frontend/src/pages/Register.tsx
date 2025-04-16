"use client"

import { useState, type ChangeEvent, type FormEvent } from "react"
import { Link, useNavigate } from "react-router-dom"
import supabase from "../lib/supabaseClient"
import { FcGoogle } from "react-icons/fc"
import { Button } from "../components/ui/button"
import { Input } from "../components/ui/input"
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "../components/ui/card"
import { EyeIcon, EyeOffIcon, UserIcon, MailIcon, LockIcon, PhoneIcon, CalendarIcon } from "lucide-react"

interface FormData {
  nombre_completo: string
  email: string
  password: string
  telefono: string
  date_of_birth: string
  gender: string
}

export default function Register() {
  const [formData, setFormData] = useState<FormData>({
    nombre_completo: "",
    email: "",
    password: "",
    telefono: "",
    date_of_birth: "",
    gender: "",
  })

  const [message, setMessage] = useState({ text: "", type: "" })
  const [selectedRole, setSelectedRole] = useState("paciente")
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [step, setStep] = useState(1)
  const [termsAccepted, setTermsAccepted] = useState(false)
  const navigate = useNavigate()

  const handleChange = (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    })
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (step === 1) {
      setStep(2)
      return
    }

    if (!termsAccepted) {
      setMessage({
        text: "Debes aceptar los términos y condiciones para continuar.",
        type: "error",
      })
      return
    }

    setLoading(true)
    setMessage({ text: "", type: "" })

    try {
      // 1. Registrar usuario en Supabase Auth
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: formData.email,
        password: formData.password,
        options: {
          data: {
            full_name: formData.nombre_completo,
            role: selectedRole,
          },
        },
      })

      if (authError) throw authError

      // 2. Guardar en la tabla correspondiente según el rol
      if (selectedRole === "administrador") {
        const { error: adminError } = await supabase.from("administradores").insert([
          {
            id: authData.user.id,
            nombre: formData.nombre_completo,
            email: formData.email,
            telefono: formData.telefono,
          },
        ])

        if (adminError) throw adminError

        setMessage({
          text: "¡Administrador registrado! Por favor verifica tu email.",
          type: "success",
        })
      } else if (selectedRole === "paciente") {
        const patientData = {
          user_id: authData.user.id,
          name: formData.nombre_completo,
          email: formData.email,
          phone: formData.telefono,
          date_of_birth: formData.date_of_birth || null,
          gender: formData.gender || null,
          created_at: new Date().toISOString(),
        }

        const { error: patientError } = await supabase.from("patients").insert([patientData])

        if (patientError) throw patientError

        navigate("/paciente", {
          state: {
            welcomeMessage: `¡Bienvenido ${formData.nombre_completo}!`,
            userId: authData.user.id,
          },
        })
        return
      }

      // Limpiar formulario si no hubo redirección
      setFormData({
        nombre_completo: "",
        email: "",
        password: "",
        telefono: "",
        date_of_birth: "",
        gender: "",
      })
      setStep(1)
    } catch (error) {
      setMessage({
        text: error.message || "Error en el registro. Por favor intenta nuevamente.",
        type: "error",
      })
    } finally {
      setLoading(false)
    }
  }

  const handleGoogleSignUp = async () => {
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/paciente`,
          queryParams: {
            access_type: "offline",
            prompt: "consent",
          },
        },
      })

      if (error) throw error
    } catch (error) {
      setMessage({
        text: error.message,
        type: "error",
      })
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-emerald-50 to-white p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-emerald-100 mb-4">
          <img src="/src/pages/logo.png" alt="Carelux Point Logo" width="128" height="128" className="opacity-90" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Carelux Point</h1>
          <p className="text-gray-500 mt-1">Registrate es gratis</p>
        </div>

        <Card className="w-full">
          <CardHeader>
            <CardTitle className="text-xl text-center">Crear cuenta</CardTitle>
            <CardDescription className="text-center">Completa tus datos para registrarte</CardDescription>
          </CardHeader>

          {/* Role Selector */}
          <div className="px-6">
            <div className="flex items-center justify-center border-b border-gray-200 mb-4">
              <div
                onClick={() => setSelectedRole("paciente")}
                className={`relative px-4 py-2 text-sm cursor-pointer ${selectedRole === "paciente" ? "text-emerald-600 font-medium" : "text-gray-600 hover:text-gray-900"}`}
              >
                Paciente
                {selectedRole === "paciente" && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-emerald-600 rounded-t"></div>
                )}
              </div>
              <div className="h-5 w-px bg-gray-300"></div>
              <div
                onClick={() => setSelectedRole("administrador")}
                className={`relative px-4 py-2 text-sm cursor-pointer ${selectedRole === "administrador" ? "text-emerald-600 font-medium" : "text-gray-600 hover:text-gray-900"}`}
              >
                Administrador
                {selectedRole === "administrador" && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-emerald-600 rounded-t"></div>
                )}
              </div>
            </div>
          </div>

          {message.text && (
            <div
              className={`mx-6 mb-4 p-3 text-sm rounded-md ${
                message.type === "success"
                  ? "bg-green-50 text-green-700 border border-green-200"
                  : "bg-red-50 text-red-700 border border-red-200"
              }`}
            >
              {message.text}
            </div>
          )}

          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {step === 1 ? (
                <>
                  <div className="space-y-2">
                    <label
                      htmlFor="nombre_completo"
                      className="text-sm font-medium text-gray-700 flex items-center gap-2"
                    >
                      <UserIcon className="h-4 w-4" />
                      Nombre Completo *
                    </label>
                    <Input
                      id="nombre_completo"
                      name="nombre_completo"
                      type="text"
                      placeholder="Ej: María González"
                      required
                      value={formData.nombre_completo}
                      onChange={handleChange}
                    />
                  </div>

                  <div className="space-y-2">
                    <label htmlFor="email" className="text-sm font-medium text-gray-700 flex items-center gap-2">
                      <MailIcon className="h-4 w-4" />
                      Correo electrónico *
                    </label>
                    <Input
                      id="email"
                      name="email"
                      type="email"
                      placeholder="tu@email.com"
                      required
                      value={formData.email}
                      onChange={handleChange}
                    />
                  </div>

                  <div className="space-y-2">
                    <label htmlFor="password" className="text-sm font-medium text-gray-700 flex items-center gap-2">
                      <LockIcon className="h-4 w-4" />
                      Contraseña *
                    </label>
                    <div className="relative">
                      <Input
                        id="password"
                        name="password"
                        type={showPassword ? "text" : "password"}
                        placeholder="••••••••"
                        minLength={6}
                        required
                        value={formData.password}
                        onChange={handleChange}
                      />
                      <button
                        type="button"
                        className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500 hover:text-gray-700"
                        onClick={() => setShowPassword(!showPassword)}
                      >
                        {showPassword ? <EyeOffIcon className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}
                      </button>
                    </div>
                    <p className="text-xs text-gray-500">Mínimo 6 caracteres</p>
                  </div>
                </>
              ) : (
                <>
                  <div className="space-y-2">
                    <label htmlFor="telefono" className="text-sm font-medium text-gray-700 flex items-center gap-2">
                      <PhoneIcon className="h-4 w-4" />
                      Teléfono
                    </label>
                    <Input
                      id="telefono"
                      name="telefono"
                      type="tel"
                      placeholder="+52 123 456 7890"
                      value={formData.telefono}
                      onChange={handleChange}
                    />
                  </div>

                  {selectedRole === "paciente" && (
                    <>
                      <div className="space-y-2">
                        <label
                          htmlFor="date_of_birth"
                          className="text-sm font-medium text-gray-700 flex items-center gap-2"
                        >
                          <CalendarIcon className="h-4 w-4" />
                          Fecha de nacimiento
                        </label>
                        <Input
                          id="date_of_birth"
                          name="date_of_birth"
                          type="date"
                          value={formData.date_of_birth}
                          onChange={handleChange}
                          max={new Date().toISOString().split("T")[0]}
                        />
                      </div>

                      <div className="space-y-2">
                        <label htmlFor="gender" className="text-sm font-medium text-gray-700">
                          Género
                        </label>
                        <select
                          id="gender"
                          name="gender"
                          value={formData.gender}
                          onChange={handleChange}
                          className="w-full h-10 rounded-md border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:ring-offset-2"
                        >
                          <option value="">Seleccionar...</option>
                          <option value="masculino">Masculino</option>
                          <option value="femenino">Femenino</option>
                          <option value="otro">Otro</option>
                          <option value="prefiero_no_decir">Prefiero no decir</option>
                        </select>
                      </div>
                    </>
                  )}

                  <div className="flex items-center mt-4">
                    <input
                      id="terms"
                      type="checkbox"
                      checked={termsAccepted}
                      onChange={() => setTermsAccepted(!termsAccepted)}
                      className="h-4 w-4 text-emerald-600 focus:ring-emerald-500 border-gray-300 rounded"
                    />
                    <label htmlFor="terms" className="ml-2 block text-sm text-gray-700">
                      Acepto los{" "}
                      <Link to="/terms" className="text-emerald-600 hover:underline">
                        Términos y Condiciones
                      </Link>
                    </label>
                  </div>
                </>
              )}

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? (
                  <span className="flex items-center">
                    <svg
                      className="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      ></circle>
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      ></path>
                    </svg>
                    {step === 1 ? "Continuar" : "Registrando..."}
                  </span>
                ) : step === 1 ? (
                  "Continuar"
                ) : (
                  "Registrarse"
                )}
              </Button>

              {step === 1 && selectedRole === "paciente" && (
                <>
                  <div className="relative my-4">
                    <div className="absolute inset-0 flex items-center">
                      <div className="w-full border-t border-gray-200"></div>
                    </div>
                    <div className="relative flex justify-center text-sm">
                      <span className="px-2 bg-white text-gray-500">O regístrate con</span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleGoogleSignUp}
                    className="w-full flex items-center justify-center gap-2 py-2 px-4 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500"
                  >
                    <FcGoogle className="h-5 w-5" />
                    <span>Google</span>
                  </button>
                </>
              )}

              {step === 2 && (
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="w-full text-sm text-emerald-600 hover:text-emerald-500 mt-2"
                >
                  Volver al paso anterior
                </button>
              )}
            </form>
          </CardContent>

          <CardFooter className="flex flex-col space-y-4">
            <p className="text-sm text-center text-gray-600">
              ¿Ya tienes una cuenta?{" "}
              <Link to="/login" className="font-medium text-emerald-600 hover:text-emerald-500">
                Iniciar sesión
              </Link>
            </p>
          </CardFooter>
        </Card>

        <div className="mt-8 text-center text-xs text-gray-500">
          <p>© {new Date().getFullYear()} Carelux Point. Todos los derechos reservados.</p>
          <div className="flex justify-center space-x-4 mt-2">
            <Link to="/terms" className="hover:text-emerald-600">
              Términos
            </Link>
            <Link to="/privacy" className="hover:text-emerald-600">
              Privacidad
            </Link>
            <Link to="/help" className="hover:text-emerald-600">
              Ayuda
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}

