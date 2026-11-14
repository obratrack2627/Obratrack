export interface GenerationOptions {
  instructions?: string;
  json?: boolean;
  schema?: Record<string, unknown>;
  image?: { mimeType: string; data: string };
  fetcher?: typeof fetch;
  timeoutMs?: number;
  budgetMs?: number;
}
