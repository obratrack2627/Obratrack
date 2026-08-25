import React from 'react';
import Link from 'next/link';
import { HardHat } from 'lucide-react';

interface NavbarProps {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}

export default function Navbar({ title, subtitle, action }: NavbarProps) {
  return (
    <header className="bg-kraft-50 border-b border-kraft-200 px-6 py-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 sticky top-0 z-30 shadow-sm">
      <div>
        <h1 className="text-2xl font-bold text-navy-900 tracking-tight font-heading flex items-center gap-2">
          {title}
        </h1>
        {subtitle && <p className="text-xs text-kraft-800 font-sans mt-0.5">{subtitle}</p>}
      </div>
      {action && <div className="flex items-center gap-3">{action}</div>}
    </header>
  );
}
