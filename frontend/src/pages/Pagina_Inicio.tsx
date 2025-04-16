"use client"

import { useState } from "react"
import {
  Menu,
  X,
  CheckCircle,
  LineChart,
  Pill,
  Stethoscope,
  UserCircle,
  Shield,
  Users,
  Tablet,
} from "lucide-react"
import '../App.css'
import '../index.css'

export default function LandingPage() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <header className="sticky top-0 z-50 w-full border-b bg-white/95 backdrop-blur">
        <div className="container mx-auto px-4 flex h-16 items-center justify-between">
          <div className="flex items-center gap-2 font-bold text-xl text-[#4d7c6f]">
            <img src="/src/pages/logo.png" alt="Carelux Point" className="h-10 w-10" />
            <span>Carelux Point</span>
          </div>
          
          <nav className="hidden md:flex items-center space-x-6">
            
          </nav>

          <div className="hidden md:flex items-center gap-4">
            <a href="/login">
              <button className="inline-flex items-center justify-center rounded-md text-sm font-medium border border-[#4d7c6f] text-[#4d7c6f] h-10 px-5 transition-colors hover:bg-[#4d7c6f]/10">
                Iniciar Sesión
              </button>
            </a>
            <a href="/register">
              <button className="inline-flex items-center justify-center rounded-md text-sm font-medium bg-[#4d7c6f] text-white h-10 px-5 transition-colors hover:bg-[#3a5e54]">
                Comienza hoy gratis
              </button>
            </a>
          </div>

          <button
            className="flex items-center justify-center rounded-md p-2 text-gray-700 md:hidden"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            <span className="sr-only">Toggle menu</span>
          </button>
        </div>

        {mobileMenuOpen && (
          <div className="absolute top-16 inset-x-0 bg-white shadow-lg md:hidden py-4 px-4">
            <nav className="flex flex-col space-y-4 mb-4">
              <a href="#features" className="text-sm font-medium hover:text-[#4d7c6f]">
                Características
              </a>
              <a href="#interfaces" className="text-sm font-medium hover:text-[#4d7c6f]">
                Interfaces
              </a>
              <a href="#pricing" className="text-sm font-medium hover:text-[#4d7c6f]">
                Precios
              </a>
            </nav>
            <div className="flex flex-col gap-2">
              <a href="/login" className="w-full">
                <button className="w-full inline-flex items-center justify-center rounded-md text-sm font-medium border border-[#4d7c6f] text-[#4d7c6f] h-10 transition-colors hover:bg-[#4d7c6f]/10">
                  Iniciar Sesión
                </button>
              </a>
              <a href="/register" className="w-full">
                <button className="w-full inline-flex items-center justify-center rounded-md text-sm font-medium bg-[#4d7c6f] text-white h-10 transition-colors hover:bg-[#3a5e54]">
                  Comienza hoy gratis
                </button>
              </a>
            </div>
          </div>
        )}
      </header>

      <main className="flex-1">
        {/* Hero Section */}
        <section className="w-full py-16 md:py-24 lg:py-32 bg-gradient-to-br from-white via-[#f5f2e8] to-[#e8f0ed]">
          <div className="container mx-auto px-4">
            <div className="grid gap-12 lg:grid-cols-2 items-center">
              <div className="flex flex-col justify-center space-y-6">
                <div className="inline-flex items-center px-3 py-1 rounded-full bg-[#4d7c6f]/10 text-[#4d7c6f] text-sm font-medium">
                  Plataforma médica digital
                </div>
                <div className="space-y-4">
                  <h1 className="text-4xl font-bold tracking-tight sm:text-5xl xl:text-6xl text-gray-900">
                    Transformando la gestión de prescripciones médicas
                  </h1>
                  <p className="text-lg text-gray-600 max-w-[600px]">
                    Plataforma integral que conecta médicos, farmacéuticos y pacientes en un ecosistema digital seguro y
                    eficiente.
                  </p>
                </div>
                <div className="flex flex-col sm:flex-row gap-4">
                  <a href="/register" className="w-full sm:w-auto">
                    <button className="w-full sm:w-auto inline-flex items-center justify-center rounded-md text-base font-medium bg-[#4d7c6f] text-white h-12 px-8 transition-colors hover:bg-[#3a5e54]">
                      Comienza hoy gratis
                    </button>
                  </a>
                  <a href="#demo" className="w-full sm:w-auto">
                    <button className="w-full sm:w-auto inline-flex items-center justify-center rounded-md text-base font-medium border border-[#4d7c6f] text-[#4d7c6f] h-12 px-8 transition-colors hover:bg-[#4d7c6f]/10">
                      Ver demostración
                    </button>
                  </a>
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-500 mt-6">
                  <Shield className="h-4 w-4" />
                  <span>Seguridad avanzada y cumplimiento normativo</span>
                </div>
              </div>
              <div className="flex justify-center lg:justify-end">
                <div className="relative w-full max-w-[550px] aspect-video rounded-2xl overflow-hidden shadow-xl">
                  <div className="absolute inset-0 bg-gradient-to-br from-[#4d7c6f]/30 to-[#4d7c6f]/10 flex items-center justify-center">
                    <img src="/src/pages/logo.png" alt="Carelux Point Logo" width="150" height="150" className="drop-shadow-lg" />
                  </div>
                  <div className="absolute bottom-4 left-4 right-4 bg-white/90 backdrop-blur-sm rounded-lg p-4 shadow-lg">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-[#4d7c6f] flex items-center justify-center text-white">
                        <Stethoscope className="h-5 w-5" />
                      </div>
                      <div>
                        <h3 className="font-medium">CARELUX</h3>
                        <p className="text-sm text-gray-600">Conectando a todos los actores del ecosistema médico</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Stats Section */}
        <section className="w-full py-12 bg-white">
          <div className="container mx-auto px-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
              <div className="text-center">
                <div className="text-3xl font-bold text-[#4d7c6f]">100%</div>
                <p className="text-sm text-gray-600 mt-1">Seguro y confiable</p>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-[#4d7c6f]">24/7</div>
                <p className="text-sm text-gray-600 mt-1">Acceso garantizado</p>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-[#4d7c6f]">Una sola Afiliación</div>
                <p className="text-sm text-gray-600 mt-1">Usala en muchos negocios</p>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-[#4d7c6f]">Facil y rapido de usar</div>
                <p className="text-sm text-gray-600 mt-1">Agrega medicamentos y prescribe recetas</p>
              </div>
            </div>
          </div>
        </section>

        {/* Interfaces Section */}
        <section id="interfaces" className="w-full py-16 md:py-24 bg-gray-50">
          <div className="container mx-auto px-4">
            <div className="flex flex-col items-center text-center mb-16">
              <div className="inline-flex items-center px-3 py-1 rounded-full bg-[#4d7c6f]/10 text-[#4d7c6f] text-sm font-medium mb-4">
                Experiencias personalizadas
              </div>
              <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-gray-900 mb-4">
                Interfaces especializadas para cada usuario
              </h2>
              <p className="max-w-[800px] text-lg text-gray-600">
                Nuestra plataforma ofrece experiencias personalizadas para administradores, farmacéuticos, médicos y
                pacientes.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
              {/* Admin Interface */}
              <div className="rounded-xl border bg-white shadow-sm hover:shadow-md transition-shadow overflow-hidden">
                <div className="p-1 bg-gradient-to-r from-[#4d7c6f] to-[#6b9c8f]">
                  <div className="bg-white p-6 rounded-t-lg">
                    <div className="w-14 h-14 rounded-xl bg-[#4d7c6f]/10 flex items-center justify-center mb-4">
                      <LineChart className="h-7 w-7 text-[#4d7c6f]" />
                    </div>
                    <h3 className="text-xl font-semibold">Interfaz del Administrador</h3>
                  </div>
                </div>
                <div className="p-6">
                  <ul className="space-y-3">
                    <li className="flex items-start gap-3">
                      <CheckCircle className="h-5 w-5 text-[#4d7c6f] flex-shrink-0 mt-0.5" />
                      <span>Dashboard interactivo con visualización de ventas e inventario</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <CheckCircle className="h-5 w-5 text-[#4d7c6f] flex-shrink-0 mt-0.5" />
                      <span>Informes personalizables y gestión de usuarios</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <CheckCircle className="h-5 w-5 text-[#4d7c6f] flex-shrink-0 mt-0.5" />
                      <span>Recomendaciones automáticas de compras basadas en historial</span>
                    </li>
                  </ul>
                </div>
              </div>

              {/* Pharmacist Interface */}
              <div className="rounded-xl border bg-white shadow-sm hover:shadow-md transition-shadow overflow-hidden">
                <div className="p-1 bg-gradient-to-r from-[#4d7c6f] to-[#6b9c8f]">
                  <div className="bg-white p-6 rounded-t-lg">
                    <div className="w-14 h-14 rounded-xl bg-[#4d7c6f]/10 flex items-center justify-center mb-4">
                      <Pill className="h-7 w-7 text-[#4d7c6f]" />
                    </div>
                    <h3 className="text-xl font-semibold">Interfaz del Farmacéutico</h3>
                  </div>
                </div>
                <div className="p-6">
                  <ul className="space-y-3">
                    <li className="flex items-start gap-3">
                      <CheckCircle className="h-5 w-5 text-[#4d7c6f] flex-shrink-0 mt-0.5" />
                      <span>Recepción de recetas electrónicas y verificación de autenticidad</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <CheckCircle className="h-5 w-5 text-[#4d7c6f] flex-shrink-0 mt-0.5" />
                      <span>Gestión de inventario y seguimiento de dispensación</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <CheckCircle className="h-5 w-5 text-[#4d7c6f] flex-shrink-0 mt-0.5" />
                      <span>Alertas para medicamentos controlados y registro de visitas</span>
                    </li>
                  </ul>
                </div>
              </div>

              {/* Doctor Interface */}
              <div className="rounded-xl border bg-white shadow-sm hover:shadow-md transition-shadow overflow-hidden">
                <div className="p-1 bg-gradient-to-r from-[#4d7c6f] to-[#6b9c8f]">
                  <div className="bg-white p-6 rounded-t-lg">
                    <div className="w-14 h-14 rounded-xl bg-[#4d7c6f]/10 flex items-center justify-center mb-4">
                      <Stethoscope className="h-7 w-7 text-[#4d7c6f]" />
                    </div>
                    <h3 className="text-xl font-semibold">Interfaz del Médico</h3>
                  </div>
                </div>
                <div className="p-6">
                  <ul className="space-y-3">
                    <li className="flex items-start gap-3">
                      <CheckCircle className="h-5 w-5 text-[#4d7c6f] flex-shrink-0 mt-0.5" />
                      <span>Creación y seguimiento de recetas electrónicas</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <CheckCircle className="h-5 w-5 text-[#4d7c6f] flex-shrink-0 mt-0.5" />
                      <span>Acceso a historial de pacientes y análisis detallados</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <CheckCircle className="h-5 w-5 text-[#4d7c6f] flex-shrink-0 mt-0.5" />
                      <span>Recomendaciones automáticas para el tratamiento</span>
                    </li>
                  </ul>
                </div>
              </div>

              {/* Patient Interface */}
              <div className="rounded-xl border bg-white shadow-sm hover:shadow-md transition-shadow overflow-hidden">
                <div className="p-1 bg-gradient-to-r from-[#4d7c6f] to-[#6b9c8f]">
                  <div className="bg-white p-6 rounded-t-lg">
                    <div className="w-14 h-14 rounded-xl bg-[#4d7c6f]/10 flex items-center justify-center mb-4">
                      <UserCircle className="h-7 w-7 text-[#4d7c6f]" />
                    </div>
                    <h3 className="text-xl font-semibold">Interfaz del Paciente</h3>
                  </div>
                </div>
                <div className="p-6">
                  <ul className="space-y-3">
                    <li className="flex items-start gap-3">
                      <CheckCircle className="h-5 w-5 text-[#4d7c6f] flex-shrink-0 mt-0.5" />
                      <span>Acceso al historial médico y recetas anteriores</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <CheckCircle className="h-5 w-5 text-[#4d7c6f] flex-shrink-0 mt-0.5" />
                      <span>Recepción de notificaciones de nuevos tratamientos</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <CheckCircle className="h-5 w-5 text-[#4d7c6f] flex-shrink-0 mt-0.5" />
                      <span>Realizar pedidos de medicamentos en línea</span>
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="w-full py-16 bg-[#4d7c6f]">
          <div className="container mx-auto px-4">
            <div className="flex flex-col items-center text-center">
              <h2 className="text-3xl font-bold text-white mb-6">
                Comience a transformar su práctica médica hoy
              </h2>
              <p className="text-lg text-white/90 max-w-[600px] mb-8">
                Únase a miles de profesionales médicos que ya confían en Carelux Point para la gestión de prescripciones
              </p>
              <a href="/register">
                <button className="inline-flex items-center justify-center rounded-md font-medium bg-white text-[#4d7c6f] h-12 px-8 hover:bg-gray-100 transition-colors">
                  Comenzar prueba gratuita
                </button>
              </a>
            </div>
          </div>
        </section>
      </main>

      <footer className="bg-gray-50 border-t py-12">
        <div className="container mx-auto px-4">
          <div className="grid md:grid-cols-4 gap-8 mb-8">
            <div>
              <div className="flex items-center gap-2 font-bold text-xl text-[#4d7c6f] mb-4">
                <img src="/src/pages/logo.png" alt="Carelux Point" className="h-8 w-8" />
                <span>Carelux Point</span>
              </div>
              <p className="text-gray-600 text-sm">
                Transformando la gestión de prescripciones médicas con tecnología segura e intuitiva.
              </p>
            </div>
            
            <div>
              <h4 className="font-medium mb-4">Soluciones</h4>
              <ul className="space-y-2 text-sm text-gray-600">
                <li><a href="#" className="hover:text-[#4d7c6f]">Para médicos</a></li>
                <li><a href="#" className="hover:text-[#4d7c6f]">Para farmacias</a></li>
                <li><a href="#" className="hover:text-[#4d7c6f]">Para pacientes</a></li>
                <li><a href="#" className="hover:text-[#4d7c6f]">Para clínicas</a></li>
              </ul>
            </div>
            
            <div>
              <h4 className="font-medium mb-4">Recursos</h4>
              <ul className="space-y-2 text-sm text-gray-600">
                <li><a href="#" className="hover:text-[#4d7c6f]">Centro de ayuda</a></li>
                <li><a href="#" className="hover:text-[#4d7c6f]">Documentación</a></li>
                <li><a href="#" className="hover:text-[#4d7c6f]">Blog</a></li>
                <li><a href="#" className="hover:text-[#4d7c6f]">Guías</a></li>
              </ul>
            </div>
            
            <div>
              <h4 className="font-medium mb-4">Contacto</h4>
              <ul className="space-y-2 text-sm text-gray-600">
                <li>contacto@careluxpoint.com</li>
                <li>+52 123 456 7890</li>
                <li>CDMX, México</li>
              </ul>
            </div>
          </div>
          
          <div className="pt-8 border-t text-center text-sm text-gray-500">
            &copy; 2025 Carelux Point. Todos los derechos reservados.
          </div>
        </div>
      </footer>
    </div>
  )
}