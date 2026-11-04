// Compartido por el navegador, los contactos y el canal de WhatsApp.
export function canonicalPhone(value: string) {
  let digits = value.replace(/\D/g, '');
  if (digits.length === 8) digits = `569${digits}`;
  else if (digits.length === 9 && digits.startsWith('9')) digits = `56${digits}`;
  return /^\d{10,15}$/.test(digits) ? digits : '';
}
