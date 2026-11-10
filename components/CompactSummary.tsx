import type { ReactNode } from 'react';

/** Los indicadores permanecen visibles también en terreno, sin un paso adicional. */
export default function CompactSummary({ children }: { children: ReactNode }) {
  return <div className="summary-overview min-w-0 max-w-full">{children}</div>;
}
