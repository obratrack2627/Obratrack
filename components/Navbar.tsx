import React from 'react';

interface NavbarProps {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}

export default function Navbar({ title, subtitle, action }: NavbarProps) {
  return (
    <header className="bg-[#FAF8F5] border-b border-[#E5DFC9] px-6 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sticky top-0 z-30 shadow-sm backdrop-blur-md bg-opacity-95">
      <div>
        <h1 className="text-xl sm:text-2xl font-black text-[#1E1E1E] tracking-tight font-heading flex items-center gap-2">
          {title}
        </h1>
        {subtitle && <p className="text-xs text-gray-500 font-sans mt-0.5">{subtitle}</p>}
      </div>
      {action && <div className="flex items-center gap-3">{action}</div>}
    </header>
  );
}
