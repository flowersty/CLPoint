"use client"

import { useState, type ChangeEvent, type FormEvent } from "react"
import { Link, useNavigate } from "react-router-dom"
import supabase from "../lib/supabaseClient"
import { FcGoogle } from "react-icons/fc"
import { Button } from "../components/ui/button"
import { Input } from "../components/ui/input"
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "../components/ui/card"
import { EyeIcon, EyeOffIcon, LockIcon, MailIcon } from "lucide-react"

interface FormData {
  email: string
  password: string
}

export default function Login() {
  const [formData, setFormData] = useState<FormData>({
    email: "",
    password: "",
  })
  const [loading, setLoading] = useState<boolean>(false)
  const [error, setError] = useState<string>("")
  const [showPassword, setShowPassword] = useState<boolean>(false)
  const navigate = useNavigate()

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    })
  }

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setLoading(true)
    setError("")

    try {
      // 1. Inicio de sesión con Supabase Auth
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.signInWithPassword({
        email: formData.email,
        password: formData.password,
      })

      if (authError) throw authError

      // 2. Determinar el rol del usuario
      let userRole = user.user_metadata?.role

      if (!userRole) {
        // Consultar en tabla trabajadores si es doctor/farmacéutico
        const { data: trabajador } = await supabase.from("trabajadores").select("tipo").eq("user_id", user.id).single()

        if (trabajador) {
          userRole = trabajador.tipo
        } else {
          // Verificar si es administrador
          const { data: admin } = await supabase.from("administradores").select().eq("id", user.id).single()

          userRole = admin ? "administrador" : "paciente"
        }

        // Actualizar metadata con el rol
        await supabase.auth.updateUser({
          data: { role: userRole },
        })
      }

      // 3. Redirección según rol
      switch (userRole) {
        case "paciente":
          navigate("/paciente")
          break
        case "doctor":
          navigate("/doctor/consultas")
          break
        case "farmaceutico":
          navigate("/farmaceutico")
          break
        case "administrador":
          navigate("/setup_farmacia")
          break
        default:
          navigate("/")
      }
    } catch (err) {
      setError(err.message || "Error al iniciar sesión")
    } finally {
      setLoading(false)
    }
  }

  const handleGoogleLogin = async () => {
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/paciente/dashboard`,
        },
      })
      if (error) throw error
    } catch (err) {
      setError(err.message)
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
          <p className="text-gray-500 mt-1">Bienvenid@ de vuelta</p>
        </div>

        <Card className="w-full">
          <CardHeader>
            <CardTitle className="text-xl text-center">Iniciar Sesión</CardTitle>
            <CardDescription className="text-center">Accede a tu cuenta según tu rol</CardDescription>
          </CardHeader>

          {error && (
            <div className="mx-6 mb-2 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md text-sm">
              {error}
            </div>
          )}

          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="email" className="text-sm font-medium text-gray-700 flex items-center gap-2">
                  <MailIcon className="h-4 w-4" />
                  Correo electrónico
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
                  Contraseña
                </label>
                <div className="relative">
                  <Input
                    id="password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
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
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <input
                    id="remember-me"
                    name="remember-me"
                    type="checkbox"
                    className="h-4 w-4 text-emerald-600 focus:ring-emerald-500 border-gray-300 rounded"
                  />
                  <label htmlFor="remember-me" className="ml-2 block text-sm text-gray-700">
                    Recordar sesión
                  </label>
                </div>
                <Link
                  to="/recuperar-contrasena"
                  className="text-sm font-medium text-emerald-600 hover:text-emerald-500"
                >
                  ¿Olvidaste tu contraseña?
                </Link>
              </div>

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
                    Iniciando sesión...
                  </span>
                ) : (
                  "Iniciar sesión"
                )}
              </Button>

              <div className="relative my-4">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-200"></div>
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-2 bg-white text-gray-500">O continúa con</span>
                </div>
              </div>

              <button
                type="button"
                onClick={handleGoogleLogin}
                className="w-full flex items-center justify-center gap-2 py-2 px-4 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500"
              >
                <FcGoogle className="h-5 w-5" />
                <span>Google</span>
              </button>
            </form>
          </CardContent>

          <CardFooter className="flex flex-col space-y-4">
            <p className="text-sm text-center text-gray-600">
              ¿No tienes una cuenta?{" "}
              <Link to="/register" className="font-medium text-emerald-600 hover:text-emerald-500">
                Regístrate
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

