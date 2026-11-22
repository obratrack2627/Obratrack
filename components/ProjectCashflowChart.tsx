'use client';

import React, { useMemo } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import { formatCLP } from '@/lib/utils';
import { MASKED_CLP_AMOUNT } from '@/lib/privacy/mask';
import type { Imprevisto, MaterialProyecto, Pago } from '@/types/database';

const compactCLP = (value: number) => {
  const amount = Number(value) || 0;
  if (Math.abs(amount) >= 1_000_000) {
    return `$${(amount / 1_000_000).toLocaleString('es-CL', { maximumFractionDigits: 1 })}M`;
  }
  if (Math.abs(amount) >= 1_000) {
    return `$${(amount / 1_000).toLocaleString('es-CL', { maximumFractionDigits: 0 })}k`;
  }
  return formatCLP(amount);
};

function monthLabel(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  if (!y || !m) return ym;
  const date = new Date(Date.UTC(y, m - 1, 1));
  return date.toLocaleDateString('es-CL', { month: 'short', year: '2-digit', timeZone: 'UTC' });
}

export default function ProjectCashflowChart({
  pagos,
  materiales,
  imprevistos,
  revealed,
}: {
  pagos: Pago[];
  materiales: MaterialProyecto[];
  imprevistos: Imprevisto[];
  revealed: boolean;
}) {
  const series = useMemo(() => {
    const byMonth = new Map<string, { ym: string; label: string; Cobros: number; Gastos: number }>();
    const ensure = (rawDate?: string) => {
      const ym = rawDate && /^\d{4}-\d{2}/.test(rawDate) ? rawDate.slice(0, 7) : 'Sin fecha';
      if (!byMonth.has(ym)) {
        byMonth.set(ym, {
          ym,
          label: ym === 'Sin fecha' ? 'Sin fecha' : monthLabel(ym),
          Cobros: 0,
          Gastos: 0,
        });
      }
      return byMonth.get(ym)!;
    };

    for (const p of pagos) {
      if (p.estado && p.estado !== 'completado') continue;
      ensure(p.fecha).Cobros += Math.round(Number(p.monto) || 0);
    }
    for (const i of imprevistos) {
      ensure(i.fecha || i.fecha_reporte).Gastos += Math.round(Number(i.monto ?? i.monto_adicional ?? 0));
    }
    for (const m of materiales) {
      ensure(m.created_at).Gastos += Math.round(
        Number(m.subtotal || Number(m.cantidad || 0) * Number(m.precio_unitario || 0) || 0),
      );
    }

    return Array.from(byMonth.values())
      .sort((a, b) => a.ym.localeCompare(b.ym))
      .slice(-8);
  }, [pagos, materiales, imprevistos]);

  if (!series.length) {
    return (
      <div className="h-56 flex items-center justify-center text-xs text-gray-500 dark:text-gray-400">
        Sin movimientos mensuales registrados todavía.
      </div>
    );
  }

  return (
    <div className="h-56 w-full min-w-0">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          aria-hidden="true"
          accessibilityLayer={false}
          tabIndex={-1}
          data={series}
          margin={{ top: 12, right: 12, left: 0, bottom: 8 }}
          barGap={6}
        >
          <CartesianGrid vertical={false} stroke="#94a3b8" strokeOpacity={0.18} />
          <XAxis dataKey="label" stroke="#888888" fontSize={11} tickLine={false} />
          <YAxis
            width={64}
            stroke="#888888"
            fontSize={10}
            tickLine={false}
            axisLine={false}
            tickFormatter={(val: number) => (revealed ? compactCLP(val) : '$ ***')}
          />
          <Tooltip
            formatter={(val: number, name: string) => [
              revealed ? formatCLP(Number(val)) : MASKED_CLP_AMOUNT,
              name,
            ]}
            cursor={{ fill: 'rgba(148,163,184,0.10)' }}
            contentStyle={{
              backgroundColor: '#141A23',
              border: '1px solid #344156',
              borderRadius: '10px',
              color: '#fff',
            }}
            itemStyle={{ color: '#fff' }}
            labelStyle={{ color: '#fff', fontWeight: 700 }}
          />
          <Bar dataKey="Cobros" name="Cobros" fill="#6B8F72" radius={[4, 4, 0, 0]} maxBarSize={36} isAnimationActive={false} />
          <Bar dataKey="Gastos" name="Costos y Gastos" fill="#FF6A00" radius={[4, 4, 0, 0]} maxBarSize={36} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
