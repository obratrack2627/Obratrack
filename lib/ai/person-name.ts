const plain = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

/** Una respuesta sobre el trámite no es un nombre, aunque tenga varias palabras. */
export function isConversationalName(value: string): boolean {
  const text = plain(value).replace(/[.!?]+$/, "");
  return (
    /^(?:ya (?:te|lo|los|las|le|les|me|no|esta)\b|yo (?:ya|te|le|no)\b|(?:eso|esto) (?:es|era)\b|ok\b|listo\b|gracias\b|por favor\b|no (?:se|recuerdo|entiendo|me)\b|si (?:ya|esta|te)\b|todos? (?:los|las|estan)\b|faltan?\b|necesito\b|quiero\b)/.test(
      text,
    ) ||
    /\b(?:te di|te dije|te pase|te envie|los datos|todos los|no recuerdo|no entiendo|me falta|ya esta|esta bien)\b/.test(
      text,
    )
  );
}
const nameWord = new RegExp(
  "^[\\p{L}\\p{M}]+(?:['’.-][\\p{L}\\p{M}]+)*\\.?$",
  "u",
);
export function isPersonName(value: string): boolean {
  const name = value.trim();
  const parts = name.split(/\s+/);
  return (
    name.length <= 150 &&
    parts.length >= 2 &&
    parts.length <= 8 &&
    parts.every((part) => nameWord.test(part)) &&
    !isConversationalName(name)
  );
}

export function explicitPersonName(message: string): string | undefined {
  const match =
    message.match(
      /\b(?:se llama|su nombre es|nuevo nombre(?: es)?|nombre(?: completo)?\s+(?:a|por|es))\s*[:=]?\s*([^,;\n!?]+)/i,
    ) ||
    message.match(/\bnombre(?: completo)?\s*[:=]\s*([^,;\n!?]+)/i) ||
    message.match(/\bnombre\b[^,;\n]{0,180}?\s+(?:a|por)\s+([^,;\n!?]+)/i);
  const name = match?.[1]
    ?.split(/\s+y\s+(?:el|la|su|sus|cambia|actualiza)\b/i)[0]
    .split(
      /\s+(?:y\s+)?(?:(?:su|el|la)\s+)?(?:rut|correo|email|tel[eé]fono|as[ií]gnalo|rol)\b/i,
    )[0]
    .trim()
    .replace(
      /\s+(?:por favor|gracias|en (?:la|el) (?:ficha|sistema|registro))$/i,
      "",
    )
    .replace(/[.]+$/, "");
  return name && isPersonName(name) ? name : undefined;
}
