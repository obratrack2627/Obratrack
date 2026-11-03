import { AIError } from './errors';

const maxBytes = 24 * 1024 * 1024;
const invalidAudio = () => new AIError('AI_AUDIO_INVALID', 'No se pudo leer la nota de voz. Prueba con una grabación más corta o envía el texto.', 422);

// Meta entrega Opus en Ogg. Se decodifica localmente a WAV mono de 16 kHz para
// transcribir sin depender de ejecutables del sistema en Vercel.
async function opusToWav(bytes: Uint8Array, deadline: number): Promise<Uint8Array> {
  const { OggOpusDecoder } = await import('ogg-opus-decoder');
  // El paquete admite sampleRate aunque su declaración de tipos aún lo omite.
  const decoder = new OggOpusDecoder({ forceStereo: false, ...{ sampleRate: 16000 } });
  const chunks: Buffer[] = [];
  let size = 0;
  const append = (decoded: { channelData: Float32Array[]; samplesDecoded: number; errors: unknown[] }) => {
    if (decoded.errors.length) throw invalidAudio();
    if (!decoded.samplesDecoded) return;
    const channels = decoded.channelData;
    const samples = decoded.samplesDecoded;
    size += samples * 2;
    if (!channels.length || size > maxBytes) throw invalidAudio();
    const chunk = Buffer.alloc(samples * 2);
    for (let i = 0; i < samples; i++) {
      let value = 0;
      for (const channel of channels) value += channel[i];
      value = Math.max(-1, Math.min(1, value / channels.length));
      chunk.writeInt16LE(Math.round(value * (value < 0 ? 32768 : 32767)), i * 2);
    }
    chunks.push(chunk);
  };
  try {
    await decoder.ready;
    for (let offset = 0; offset < bytes.length; offset += 8192) {
      if (Date.now() >= deadline) throw new AIError('AI_TIMEOUT', 'La nota de voz tardó demasiado en procesarse. Envía una grabación más corta.', 503);
      append(await Promise.resolve(decoder.decode(bytes.subarray(offset, offset + 8192))));
    }
    append(await decoder.flush());
    if (!size) throw invalidAudio();
    const header = Buffer.alloc(44);
    header.write('RIFF', 0); header.writeUInt32LE(36 + size, 4); header.write('WAVEfmt ', 8);
    header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22);
    header.writeUInt32LE(16000, 24); header.writeUInt32LE(32000, 28);
    header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34); header.write('data', 36); header.writeUInt32LE(size, 40);
    return new Uint8Array(Buffer.concat([header, ...chunks]));
  } finally { decoder.free(); }
}
export async function transcriptionFile(media: { mimeType: string; data: string }, deadline: number) {
  const mime = media.mimeType.split(';')[0].trim().toLowerCase();
  const bytes = Buffer.from(media.data, 'base64');
  if (!bytes.length || bytes.length > 10 * 1024 * 1024) throw invalidAudio();
  if (mime === 'audio/ogg' || mime === 'audio/opus') {
    try { return { bytes: await opusToWav(bytes, deadline), mime: 'audio/wav', filename: 'nota.wav' }; }
    catch (error) { if (error instanceof AIError) throw error; throw invalidAudio(); }
  }
  const formats: Record<string, string> = { 'audio/mpeg': 'mp3', 'audio/mp3': 'mp3', 'audio/mp4': 'mp4', 'audio/m4a': 'm4a', 'audio/x-m4a': 'm4a', 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/webm': 'webm', 'audio/flac': 'flac' };
  const extension = formats[mime];
  if (!extension) throw invalidAudio();
  return { bytes: new Uint8Array(bytes), mime, filename: `nota.${extension}` };
}
