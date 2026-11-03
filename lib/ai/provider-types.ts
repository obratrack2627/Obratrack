export interface GenerationOptions {
  json?: boolean;
  schema?: Record<string, unknown>;
  image?: { mimeType: string; data: string };
  fetcher?: typeof fetch;
  timeoutMs?: number;
  budgetMs?: number;
}
