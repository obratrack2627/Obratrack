import OpenAI, { toFile } from 'openai';

let openaiClientInstance: OpenAI | null = null;

export function getOpenAIClient(): OpenAI | null {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || apiKey.trim() === '') {
    return null;
  }
  if (!openaiClientInstance) {
    openaiClientInstance = new OpenAI({
      apiKey: apiKey.trim(),
    });
  }
  return openaiClientInstance;
}

/**
 * Transcribe un archivo de audio usando OpenAI Whisper API
 */
export async function transcribirAudioWhisper(
  audioBuffer: Buffer,
  filename: string = 'audio.ogg'
): Promise<string> {
  const openai = getOpenAIClient();
  if (!openai) {
    throw new Error('OPENAI_API_KEY no configurada');
  }

  const file = await toFile(audioBuffer, filename, { type: 'audio/ogg' });
  const transcription = await openai.audio.transcriptions.create({
    file: file,
    model: 'whisper-1',
    language: 'es',
    temperature: 0.2,
  });

  return transcription.text || '';
}

/**
 * Genera embedding vectorial de 1536 dimensiones (compatible con Vector Search)
 */
export async function generarEmbedding(texto: string): Promise<number[] | null> {
  const openai = getOpenAIClient();
  if (!openai) return null;

  try {
    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: texto,
      dimensions: 1536,
    });
    return response.data[0]?.embedding || null;
  } catch (error) {
    console.error('Error al generar embedding con OpenAI:', error);
    return null;
  }
}
