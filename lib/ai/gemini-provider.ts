// Compatibilidad con imports históricos: no conserva transporte, claves ni fallback
// del proveedor anterior. Incluso estos aliases ejecutan exclusivamente OpenAI.
export {
  generateOpenAI as generateGemini,
  getServerOpenAIKey as getServerGeminiKey,
} from './openai-provider';
