import { canonicalPhone } from '@/lib/phone';
export const clientKindReply = /^(?:(?:es|es un|es una|un|una)\s+)?(?:cliente\s+)?(?:nuev[oa]|existente|ya existe)[.!]?$/i;

// Admite las etiquetas habituales de WhatsApp y frases como «su número es …».
export function clientInputLines(message: string) {
  return message.replace(/(?:[,;][ \t]*|[ \t]+(?:y[ \t]+)?(?=su[ \t]))(?=(?:(?:su|el)[ \t]+)?(?:n[uú]mero(?: de (?:tel[eé]fono|celular|contacto))?|tel[eé]fono|celular|whatsapp|fono|correo(?: electr[oó]nico)?|email|rut)\b[ \t]*(?:[:=]|es\b|\+?\d))/gim, '\n')
    .split(/[;\n]+/).map(line => line.trim())
    .filter(Boolean)
    .map(line => line
      .replace(/^cliente existente\s*[:=]\s*/i, 'Cliente: ')
      .replace(/^(?:(?:su|el)\s+)?(?:n[uú]mero(?: de (?:tel[eé]fono|celular|contacto))?|tel[eé]fono|celular|whatsapp|fono)(?: del cliente)?\s*(?:[:=]|\bes\b)?\s*(?=\+?\d)/i, 'Teléfono: ')
      .replace(/^(?:(?:su|el)\s+)?(?:correo(?: electr[oó]nico)?|email)(?: del cliente)?\s*(?:[:=]|\bes\b)\s*/i, 'Correo: ')
      .replace(/^(?:(?:es\s+)?(?:un[ao]?\s+)?cliente\s+nuev[oa]|nuev[oa]\s+cliente)(?:\s*[:,=]\s*|\s+)(?:(?:se llama|su nombre es)\s+)?(?=\S)/i, 'Cliente: '));
}

/** Solo valores de teléfono explícitos o líneas que contienen únicamente un número móvil. */
export function phoneChoices(message: string, pending: string[] = []) {
  const values = clientInputLines(message).flatMap(line => {
    const explicit = /^teléfono:\s*/i.test(line);
    const value = line.replace(/^teléfono:\s*/i, '').trim();
    if (!explicit && !/^\+?(?:56\s*)?9[\d ]{8,12}$/.test(value)) return [];
    if (!/^[+\d ().-]+$/.test(value)) return [];
    const phone = canonicalPhone(value);
    return phone ? ['+' + phone] : [];
  });
  const options = [...new Set(values)];
  if (options.length === 1) return { chosen: options[0], options: [] };
  return { options: options.length ? options : pending };
}

export function askPhone(options: string[]) {
  return 'Recibí más de un teléfono. ¿Cuál corresponde al cliente? Responde con el número completo.\n' +
    options.map(phone => '• ' + phone).join('\n');
}
