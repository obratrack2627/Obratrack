export type ReasoningEffort = 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max';

export interface OpenAIFunctionTool {
  type: 'function';
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  strict?: boolean;
}

export interface GenerationOptions {
  instructions?: string;
  json?: boolean;
  schema?: Record<string, unknown>;
  tools?: OpenAIFunctionTool[];
  toolChoice?: 'auto' | 'none' | 'required';
  image?: { mimeType: string; data: string };
  fetcher?: typeof fetch;
  timeoutMs?: number;
  budgetMs?: number;
  model?: string;
  reasoningEffort?: ReasoningEffort;
  maxOutputTokens?: number;
}
