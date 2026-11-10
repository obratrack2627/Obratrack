// Compartido por el navegador, los contactos y el canal de WhatsApp.
export function canonicalPhone(value: string) {
  let digits = value.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.length === 8) digits = `569${digits}`;
  else if (digits.length === 9 && digits.startsWith("9"))
    digits = `56${digits}`;
  if (digits.startsWith("56") && digits.length !== 11) return "";
  return /^[1-9]\d{9,14}$/.test(digits) ? digits : "";
}

/** Teléfonos literales: no confundir un RUT etiquetado con un móvil de ocho dígitos. */
export function phonesInText(message: string): string[] {
  const phones: string[] = [];
  for (const match of Array.from(
    message.matchAll(/(?<![\w@])\+?\d[\d ().-]{6,19}\d(?![\w@])/g),
  )) {
    const prefix = message
      .slice(Math.max(0, match.index! - 22), match.index)
      .trim();
    const labels = new Set([
      "rut",
      "identificacion",
      "presupuesto",
      "monto",
      "precio",
      "total",
      "abono",
      "pago",
    ]);
    const words = prefix
      .toLowerCase()
      .split(/[\s:=]+/)
      .filter(Boolean);
    let label = words.pop() || "";
    if (["es", "de"].includes(label)) label = words.pop() || "";
    if (prefix.endsWith("$") || labels.has(label)) continue;
    const phone = canonicalPhone(match[0]);
    if (phone) phones.push(phone);
  }
  return Array.from(new Set(phones));
}
