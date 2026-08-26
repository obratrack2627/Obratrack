import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Formateador de moneda en Pesos Chilenos (CLP) sin decimales y con puntos
export function formatCLP(amount: number | null | undefined): string {
  if (amount === undefined || amount === null) return '$ 0';
  return new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
  }).format(amount);
}

// Formateador de fechas en español de Chile (Ej: "15 de Ago, 2026")
export function formatDate(dateString: string | null | undefined): string {
  if (!dateString) return 'S/F';
  const date = new Date(dateString + 'T00:00:00');
  if (isNaN(date.getTime())) return dateString;

  return date.toLocaleDateString('es-CL', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

// Formateador de RUT chileno (Ej: "77890123K" -> "77.890.123-K")
export function formatRUT(rut: string): string {
  if (!rut) return '';
  const clean = rut.replace(/[^0-9kK]/g, '').toUpperCase();
  if (clean.length < 2) return clean;
  const dv = clean.slice(-1);
  const cuerpo = clean.slice(0, -1);
  let formatted = '';
  for (let i = cuerpo.length - 1, j = 1; i >= 0; i--, j++) {
    formatted = cuerpo[i] + formatted;
    if (j % 3 === 0 && i !== 0) formatted = '.' + formatted;
  }
  return `${formatted}-${dv}`;
}

// Formatear números con separador de miles con puntos en tiempo real (Ej: "8000" -> "8.000")
export function formatThousands(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '';
  const digits = String(value).replace(/\D/g, '');
  if (!digits) return '';
  return new Intl.NumberFormat('es-CL').format(parseInt(digits, 10));
}

// Convertir string con puntos a número entero (Ej: "8.000" -> 8000)
export function parseThousands(value: string | null | undefined): number {
  if (!value) return 0;
  const digits = String(value).replace(/\D/g, '');
  return digits ? parseInt(digits, 10) : 0;
}

// Validación matemática de RUT chileno (Módulo 11)
export function validarRutChileno(rut: string | null | undefined): boolean {
  if (!rut) return false;
  const clean = rut.replace(/[^0-9kK]/g, '').toUpperCase();
  if (clean.length < 8 || clean.length > 9) return false;

  const cuerpo = clean.slice(0, -1);
  const dvIngresado = clean.slice(-1);

  let suma = 0;
  let multiplo = 2;

  for (let i = cuerpo.length - 1; i >= 0; i--) {
    suma += parseInt(cuerpo[i], 10) * multiplo;
    multiplo = multiplo < 7 ? multiplo + 1 : 2;
  }

  const dvEsperadoCalculado = 11 - (suma % 11);
  let dvEsperado = '';
  if (dvEsperadoCalculado === 11) dvEsperado = '0';
  else if (dvEsperadoCalculado === 10) dvEsperado = 'K';
  else dvEsperado = dvEsperadoCalculado.toString();

  return dvIngresado === dvEsperado;
}

