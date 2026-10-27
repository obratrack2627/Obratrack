'use client';

import React from 'react';

interface ChatMessageFormatterProps {
  content: string;
  className?: string;
  isUser?: boolean;
}

/**
 * Formateador profesional de mensajes de chat de IA para ObraTrack.
 * Elimina la visualización de asteriscos y comillas en bruto,
 * convirtiendo markdown en tipografía limpia, listas estilizadas,
 * tarjetas de comando y chips visuales para cotizaciones y obras.
 */
export default function ChatMessageFormatter({
  content,
  className = '',
  isUser = false,
}: ChatMessageFormatterProps) {
  if (isUser) {
    return <p className={`whitespace-pre-line leading-relaxed ${className}`}>{content}</p>;
  }

  const lines = (content || '').split('\n');
  const elements: React.ReactNode[] = [];
  let currentList: { key: string; items: string[] } | null = null;

  const flushList = () => {
    if (currentList && currentList.items.length > 0) {
      elements.push(
        <ul key={currentList.key} className="space-y-1.5 my-2 pl-0.5">
          {currentList.items.map((item, idx) => (
            <li key={idx} className="flex items-start gap-2 text-xs leading-relaxed">
              <span className="w-1.5 h-1.5 rounded-full bg-[#FF6A00] mt-1.5 shrink-0" />
              <div className="flex-1 text-inherit">{formatInline(item)}</div>
            </li>
          ))}
        </ul>
      );
      currentList = null;
    }
  };

  lines.forEach((line, index) => {
    const trimmed = line.trim();

    // Línea vacía
    if (!trimmed) {
      flushList();
      return;
    }

    // Separadores horizontales
    if (trimmed === '---' || trimmed === '***' || trimmed === '___') {
      flushList();
      elements.push(
        <hr
          key={`hr-${index}`}
          className="my-3 border-t border-gray-200 dark:border-[#263040]"
        />
      );
      return;
    }

    // Encabezados H3 / H4
    if (trimmed.startsWith('### ')) {
      flushList();
      elements.push(
        <h4
          key={`h3-${index}`}
          className="font-heading font-bold text-xs uppercase tracking-wider text-[#FF6A00] mt-3 mb-1 flex items-center gap-1.5"
        >
          {formatInline(trimmed.replace(/^###\s+/, ''))}
        </h4>
      );
      return;
    }

    if (trimmed.startsWith('## ') || trimmed.startsWith('# ')) {
      flushList();
      elements.push(
        <h3
          key={`h2-${index}`}
          className="font-heading font-black text-sm text-navy-900 dark:text-white mt-3 mb-1.5"
        >
          {formatInline(trimmed.replace(/^#+\s+/, ''))}
        </h3>
      );
      return;
    }

    // Elementos de lista con viñetas: '• ', '- ', o '* ' (que no sea negrita)
    const isBullet =
      trimmed.startsWith('• ') ||
      trimmed.startsWith('- ') ||
      (/^\*\s+[^*]/.test(trimmed) && !trimmed.startsWith('**'));

    if (isBullet) {
      const itemText = trimmed.replace(/^[•\-\*]\s+/, '');
      if (!currentList) {
        currentList = { key: `list-${index}`, items: [] };
      }
      currentList.items.push(itemText);
      return;
    }

    // Elementos numerados (1. 2. etc.)
    const numMatch = trimmed.match(/^(\d+)\.\s+(.*)$/);
    if (numMatch) {
      flushList();
      elements.push(
        <div key={`num-${index}`} className="flex items-start gap-2 my-1 pl-0.5">
          <span className="font-mono font-bold text-[#FF6A00] text-[11px] shrink-0 mt-0.5">
            {numMatch[1]}.
          </span>
          <div className="flex-1 text-xs leading-relaxed">{formatInline(numMatch[2])}</div>
        </div>
      );
      return;
    }

    // Párrafo estándar
    flushList();
    elements.push(
      <p key={`p-${index}`} className="my-1.5 leading-relaxed text-xs">
        {formatInline(trimmed)}
      </p>
    );
  });

  flushList();

  return <div className={`space-y-1 ${className}`}>{elements}</div>;
}

/**
 * Procesa el formato en línea (inline):
 * - Remueve comillas combinadas con asteriscos *"texto"* y las convierte en chips visuales
 * - Formatea **negrita** sin mostrar los asteriscos
 * - Formatea *cursiva*
 * - Formatea `código`
 */
function formatInline(text: string): React.ReactNode {
  // Regex para capturar tokens en orden de prioridad:
  // 1. *"ejemplo"* o *“ejemplo”*
  // 2. **negrita**
  // 3. `código`
  // 4. *cursiva* o _cursiva_
  // 5. "frase entre comillas"
  const tokenRegex = /(\*["“](.+?)["”]\*|\*\*(.+?)\*\*|`([^`]+)`|\*([^*]+)\*|(?<![A-Za-z0-9_])_([^_]+)_(?![A-Za-z0-9_])|["“]([^"”]{3,})["”])/g;

  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = tokenRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.substring(lastIndex, match.index));
    }

    const fullMatch = match[0];

    // Caso 1: *"ejemplo entre comillas"* -> Chip de Ejemplo / Comando Estilizado
    if (
      fullMatch.startsWith('*') &&
      (fullMatch.includes('"') || fullMatch.includes('“')) &&
      fullMatch.endsWith('*')
    ) {
      const cleanQuote = fullMatch.replace(/^\*["“]/, '').replace(/["”]\*$/, '');
      parts.push(
        <span
          key={`q-${match.index}`}
          className="inline-flex items-center my-0.5 mx-1 px-2 py-0.5 rounded-md bg-[#FF6A00]/10 dark:bg-[#FF6A00]/20 text-[#D95700] dark:text-[#FFA04D] border border-[#FF6A00]/25 text-[11px] font-sans italic font-medium"
        >
          &ldquo;{cleanQuote}&rdquo;
        </span>
      );
    }
    // Caso 2: **Negrita**
    else if (fullMatch.startsWith('**') && fullMatch.endsWith('**')) {
      const boldText = fullMatch.slice(2, -2);
      parts.push(
        <strong
          key={`b-${match.index}`}
          className="font-bold text-navy-900 dark:text-white"
        >
          {boldText}
        </strong>
      );
    }
    // Caso 3: `Código en línea`
    else if (fullMatch.startsWith('`') && fullMatch.endsWith('`')) {
      const codeText = fullMatch.slice(1, -1);
      parts.push(
        <code
          key={`c-${match.index}`}
          className="px-1.5 py-0.5 mx-0.5 rounded bg-gray-100 dark:bg-[#1A2230] text-[#FF6A00] font-mono text-[11px] border border-gray-200 dark:border-[#263040]"
        >
          {codeText}
        </code>
      );
    }
    // Caso 4: *Cursiva* o _Cursiva_
    else if (
      (fullMatch.startsWith('*') && fullMatch.endsWith('*')) ||
      (fullMatch.startsWith('_') && fullMatch.endsWith('_'))
    ) {
      const italicText = fullMatch.slice(1, -1);
      parts.push(
        <em
          key={`i-${match.index}`}
          className="italic text-gray-700 dark:text-gray-300"
        >
          {italicText}
        </em>
      );
    }
    // Caso 5: "Texto entre comillas"
    else if (
      (fullMatch.startsWith('"') && fullMatch.endsWith('"')) ||
      (fullMatch.startsWith('“') && fullMatch.endsWith('”'))
    ) {
      const qText = fullMatch.slice(1, -1);
      parts.push(
        <span key={`str-${match.index}`} className="italic text-gray-800 dark:text-gray-200 font-medium">
          &ldquo;{qText}&rdquo;
        </span>
      );
    }

    lastIndex = tokenRegex.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push(text.substring(lastIndex));
  }

  return parts.length > 0 ? parts : text;
}
