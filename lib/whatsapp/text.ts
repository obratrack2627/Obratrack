/** Recorre el sufijo una sola vez, incluso con mensajes de puntuación incompletos. */
export function stripTrailingPunctuation(value: string, punctuation: string): string {
  let end = value.length;
  while (end > 0 && punctuation.includes(value[end - 1])) end--;
  return value.slice(0, end);
}
