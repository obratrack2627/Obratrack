import { canonicalPhone } from '@/lib/phone';
import { validarRutChileno } from '@/lib/utils';
import { isConversationalName } from '@/lib/ai/person-name';
import { chileanRequestContext } from '@/lib/ai/chilean-context';

const norm = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
const rut = (value: string) => {
  const clean = value.replace(/[.\s-]/g, '').toUpperCase();
  return validarRutChileno(clean) ? `${clean.slice(0,-1)}-${clean.slice(-1)}` : undefined;
};
function money(value: string): number | undefined {
  const literal = value.trim().replace(/^\$\s*/, '').replace(/\s*(?:CLP|pesos)$/i, '').trim();
  if (/^\d+(?:\.\d{3})*$/.test(literal)) {
    const amount = Number(literal.replaceAll('.', ''));
    if (Number.isSafeInteger(amount)) return amount;
  }
  const number = literal.match(/^(\d+(?:[.,]\d+)?)\s+(mil|mill[oó]n(?:es)?)$/i);
  if (number) {
    const amount = Number(number[1].replace(',', '.')) * (norm(number[2]) === 'mil' ? 1000 : 1000000);
    if (Number.isSafeInteger(amount)) return amount;
  }
  const amounts = chileanRequestContext('presupuesto '+literal).montos_explicitos;
  return amounts.length === 1 && amounts[0].texto === norm(literal) ? amounts[0].monto_clp : undefined;
}

/** Datos literales de una creación pendiente; no asigna un número a dos campos. */
export function projectLiterals(message: string, previous: Record<string, any> = {}) {
  const fields: Record<string, any> = {};
  const lines = message.split(/[\n;]+|,\s*(?=(?:rut|cliente|nombre|obra|proyecto|presupuesto|monto|tel[eé]fono|celular|whatsapp|fono|correo|email)\b)/i).map(line => line.trim()).filter(Boolean);
  const bare: string[] = [];
  for (const line of lines) {
    const labeled = line.match(/^(rut(?: del cliente)?|nombre del cliente|cliente|nombre de la obra|nombre de obra|obra(?: llamada)?|proyecto|presupuesto(?: de la obra)?|monto|tel[eé]fono(?: del cliente)?|celular|whatsapp|fono|correo(?: del cliente)?|email)(?:\s*(?::|=|\bes\b)\s*|\s+)(.+)$/i);
    if (labeled) {
      const label = norm(labeled[1]); const value = labeled[2].trim();
      if (label.startsWith('rut')) fields.cliente_rut = rut(value) || value;
      else if (/^(telefono|celular|whatsapp|fono)/.test(label)) fields.cliente_telefono = canonicalPhone(value) ? '+'+canonicalPhone(value) : value;
      else if (/^(presupuesto|monto)/.test(label)) { const amount = money(value); if (amount !== undefined) fields.monto_cotizado = amount; }
      else if (/^(correo|email)/.test(label)) fields.cliente_email = value;
      else if (value.length <= 150 && !isConversationalName(value)) fields[/^(cliente|nombre del cliente)/.test(label) ? 'cliente_nombre' : 'nombre'] = value;
    } else if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(line)) fields.cliente_email = line;
    else bare.push(line);
  }
  const numbers: string[] = [];
  const names: string[] = [];
  for (const line of bare) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(line)) continue;
    const digits = line.replace(/[.\s-]/g, '');
    const formattedRut = /^\d{1,2}\.\d{3}\.\d{3}-[\dkK]$|^\d{7,8}-[\dkK]$/.test(line);
    const compactRut = (!previous.cliente_rut || lines.length >= 4 && line === lines[0]) && /^\d{7,8}[\dkK]$/.test(line) && (!canonicalPhone(line) || (previous.cliente_telefono && !previous.cliente_rut));
    if (formattedRut || (compactRut && (rut(line) || (!previous.cliente_rut && !fields.cliente_rut)))) {
      fields.cliente_rut = rut(line) || digits;
    } else if (money(line) !== undefined) numbers.push(line);
    else if (/^[+\d ().-]+$/.test(line) && canonicalPhone(line)) numbers.push(line);
    else if (lines.length > 1 && line.length <= 150 && /[a-záéíóúüñ]/i.test(line) && !/[?¿@:=]/.test(line) && !isConversationalName(line) && !/\b(?:crea\w*|registr\w*|cotiz\w*|cancela\w*|consulta|muestra|continua|listo|gracias)\b/.test(norm(line))) names.push(line);
  }
  const phoneCandidates: string[] = [];
  for (const line of numbers) {
    if (previous.monto_cotizado > 0 && lines.length === 1 && /^[1-4]$/.test(line)) continue;
    const amount = money(line);
    const phone = /^[+\d ().-]+$/.test(line) ? canonicalPhone(line) : '';
    const currency = /^\$/.test(line) || /\b(?:clp|pesos|mil|millon|millones|luca|lucas|palo|palos)\b/.test(norm(line));
    if (amount !== undefined && (currency || !phone || (previous.cliente_telefono && !previous.monto_cotizado))) fields.monto_cotizado = amount;
    else if (phone && !(!previous.cliente_rut && !fields.cliente_rut && rut(line) && line.replace(/\D/g,'').length === 8)) phoneCandidates.push(phone);
  }
  const uniquePhones = Array.from(new Set(phoneCandidates));
  const budgetKnown = fields.monto_cotizado !== undefined || previous.monto_cotizado > 0;
  if (uniquePhones.length === 1 && (budgetKnown || lines.length > 1 && !!fields.cliente_email)) fields.cliente_telefono = '+'+uniquePhones[0];
  // El orden sigue los campos pedidos por el bot: cliente y después obra.
  if (names.length === 2) { fields.cliente_nombre = names[0]; fields.nombre = names[1]; }
  else if (names.length === 1) {
    if (!previous.cliente_nombre && !fields.cliente_nombre) fields.cliente_nombre = names[0];
    else if (!previous.nombre && !fields.nombre) fields.nombre = names[0];
  }
  return fields;
}
