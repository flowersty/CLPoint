import React from 'react';

interface HeaderProps {
  currentDateTime: Date;
  pharmacyName?: string;
}

const Header: React.FC<HeaderProps> = ({ currentDateTime, pharmacyName }) => {
  const formatDate = (date: Date): string => {
    const options: Intl.DateTimeFormatOptions = { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
      timeZone: 'America/Mexico_City'
    };
    return date.toLocaleDateString('es-MX', options);
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-white/95 backdrop-blur">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        <div className="flex items-center gap-2 font-bold text-xl">
          <img src="/src/pages/logo.png" alt="CareLux Logo" className="w-10 h-10" />
          {pharmacyName && <span className="text-[#4d7c6f]">{pharmacyName}</span>}
        </div>

        <div className="text-center">
          <div className="text-xl text-gray-900 font-medium">{formatDate(currentDateTime)}</div>
        </div>

        <nav className="hidden md:flex items-center gap-6">
          <a href="/" className="text-sm font-medium transition-colors hover:text-[#4d7c6f]">
            Cerrar Sesión
          </a>
        </nav>

        <button className="flex md:hidden items-center justify-center rounded-md p-2 text-gray-700">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="3" y1="12" x2="21" y2="12"></line>
            <line x1="3" y1="6" x2="21" y2="6"></line>
            <line x1="3" y1="18" x2="21" y2="18"></line>
          </svg>
        </button>
      </div>
    </header>
  );
};

export default Header;
