'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, BarChart3, Eye, EyeOff } from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  LabelList,
  CartesianGrid,
} from 'recharts';
import { formatCLP } from '@/lib/utils';
import { MASKED_CLP_AMOUNT } from '@/lib/privacy/mask';

export interface DashboardFinanceDatum {
  nombre: string;
  Presupuestado: number;
  Cobrado: number;
  Pendiente: number;
  Costos?: number;
  Margen?: number;
}

export interface DashboardPieDatum {
  name: string;
  value: number;
  color: string;
}

interface DashboardFinanceChartsProps {
  chartDataFinanzas: DashboardFinanceDatum[];
  pieDataRentabilidad: DashboardPieDatum[];
  barChartRevealed: boolean;
  onToggleBarChart: () => void;
  pieChartRevealed: boolean;
  onTogglePieChart: () => void;
  totalCobrado: number;
  saldoPendiente: number;
  totalImprevistos: number;
}

const compactCLP = (value: number) => {
  const amount = Number(value);
  if (Math.abs(amount) >= 1000000) return `$${(amount / 1000000).toLocaleString('es-CL', { maximumFractionDigits: 1 })} M`;
  if (Math.abs(amount) >= 1000) return `$${(amount / 1000).toLocaleString('es-CL', { maximumFractionDigits: 1 })} mil`;
  return formatCLP(amount);
};

export default function DashboardFinanceCharts({
  chartDataFinanzas,
  pieDataRentabilidad,
  barChartRevealed,
  onToggleBarChart,
  pieChartRevealed,
  onTogglePieChart,
  totalCobrado,
  saldoPendiente,
  totalImprevistos,
}: DashboardFinanceChartsProps) {
  const [barMode, setBarMode] = useState<'cobranza' | 'rentabilidad'>('cobranza');
  const hasProfitabilityData = chartDataFinanzas.some((d) => typeof d.Costos === 'number');

  return (
    <div data-tour-zone="charts" className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Gráfico de Flujo de Caja por Obra */}
      <div className="min-w-0 max-w-full overflow-hidden lg:col-span-2 p-4 sm:p-5 rounded-2xl bg-white dark:bg-[#141A23] border border-kraft-200 dark:border-[#263040] shadow-sm space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 min-w-0">
          <div className="min-w-0 flex-1">
            <h3 className="font-heading font-bold text-base text-navy-900 dark:text-white">
              Flujo Financiero por Obra (CLP)
            </h3>
            <p className="text-xs text-gray-500 font-mono">
              {barMode === 'cobranza'
                ? 'Comparativa entre monto contratado y pagos recaudados'
                : 'Comparativa entre contratado, costos directos y margen proyectado'}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {hasProfitabilityData && (
              <div className="inline-flex rounded-lg border border-kraft-200 dark:border-[#263040] bg-kraft-50 dark:bg-[#0F141C] p-0.5 text-[11px]">
                <button
                  type="button"
                  onClick={() => setBarMode('cobranza')}
                  className={`px-2 py-1 rounded-md font-semibold transition-colors ${
                    barMode === 'cobranza'
                      ? 'bg-[#FF6A00] text-white'
                      : 'text-gray-600 dark:text-gray-300'
                  }`}
                >
                  Cobranza
                </button>
                <button
                  type="button"
                  onClick={() => setBarMode('rentabilidad')}
                  className={`px-2 py-1 rounded-md font-semibold transition-colors ${
                    barMode === 'rentabilidad'
                      ? 'bg-[#FF6A00] text-white'
                      : 'text-gray-600 dark:text-gray-300'
                  }`}
                >
                  Rentabilidad
                </button>
              </div>
            )}
            <button
              type="button"
              onClick={onToggleBarChart}
              aria-label={barChartRevealed ? 'Ocultar montos de Flujo Financiero' : 'Mostrar montos de Flujo Financiero'}
              aria-pressed={barChartRevealed}
              title={barChartRevealed ? 'Ocultar montos' : 'Mostrar montos'}
              className="inline-flex items-center justify-center p-1.5 rounded-lg border border-kraft-200 dark:border-[#263040] bg-kraft-50/80 dark:bg-[#1E2633] text-gray-500 hover:text-[#FF6A00] transition-colors"
            >
              {barChartRevealed ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
            <Link
              href="/proyectos"
              className="text-xs font-heading font-bold text-[#FF6A00] hover:underline flex items-center gap-1"
            >
              <span>Ver todas</span>
              <ArrowUpRight className="w-3 h-3" />
            </Link>
          </div>
        </div>

        {chartDataFinanzas.length ? (
          <>
            <div className="max-w-full overflow-x-auto" role="region" aria-label="Gráfico de flujo financiero por obra" tabIndex={0}>
              <div className="h-72" style={{ minWidth: Math.max(330, chartDataFinanzas.length * 170) }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart aria-hidden="true" accessibilityLayer={false} tabIndex={-1} data={chartDataFinanzas} margin={{ top: 30, right: 16, left: 4, bottom: 15 }} barGap={6}>
                    <CartesianGrid vertical={false} stroke="#94a3b8" strokeOpacity={0.18} />
                    <XAxis dataKey="nombre" stroke="#888888" fontSize={11} tickLine={false} interval={0} tickFormatter={name => name.length > 20 ? name.slice(0, 19) + '…' : name} />
                    <YAxis width={72} stroke="#888888" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(val: number) => (barChartRevealed ? compactCLP(val) : '$ ***')} />
                    <Tooltip formatter={(value: number, name: string) => [barChartRevealed ? formatCLP(Number(value)) : MASKED_CLP_AMOUNT, name]} cursor={{ fill: 'rgba(148,163,184,0.10)' }} contentStyle={{ backgroundColor: '#141A23', border: '1px solid #344156', borderRadius: '12px', color: '#fff' }} itemStyle={{ color: '#fff' }} labelStyle={{ color: '#fff', fontWeight: 700, marginBottom: 6 }} />
                    <Bar dataKey="Presupuestado" name="Contratado" fill="#FF6A00" radius={[4, 4, 0, 0]} maxBarSize={42} isAnimationActive={false}>
                      <LabelList dataKey="Presupuestado" position="top" formatter={(val: unknown) => (barChartRevealed ? compactCLP(Number(val)) : '$ ***')} fill="#c74c00" fontSize={10} />
                    </Bar>
                    {barMode === 'cobranza' ? (
                      <Bar dataKey="Cobrado" name="Cobrado" fill="#6B8F72" radius={[4, 4, 0, 0]} maxBarSize={42} isAnimationActive={false}>
                        <LabelList dataKey="Cobrado" position="top" formatter={(val: unknown) => (barChartRevealed ? compactCLP(Number(val)) : '$ ***')} fill="#52745a" fontSize={10} />
                      </Bar>
                    ) : (
                      <>
                        <Bar dataKey="Costos" name="Costos Directos" fill="#D94336" radius={[4, 4, 0, 0]} maxBarSize={36} isAnimationActive={false}>
                          <LabelList dataKey="Costos" position="top" formatter={(val: unknown) => (barChartRevealed ? compactCLP(Number(val)) : '$ ***')} fill="#b9382c" fontSize={10} />
                        </Bar>
                        <Bar dataKey="Margen" name="Margen" fill="#6B8F72" radius={[4, 4, 0, 0]} maxBarSize={36} isAnimationActive={false}>
                          <LabelList dataKey="Margen" position="top" formatter={(val: unknown) => (barChartRevealed ? compactCLP(Number(val)) : '$ ***')} fill="#52745a" fontSize={10} />
                        </Bar>
                      </>
                    )}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </>
        ) : (
          <div className="py-10 text-center space-y-2">
            <BarChart3 className="w-8 h-8 text-gray-400 mx-auto" />
            <p className="text-sm font-semibold text-navy-900 dark:text-gray-200">
              No hay obras para mostrar en el gráfico.
            </p>
            <Link href="/proyectos" className="inline-block text-xs font-bold text-[#FF6A00] hover:underline">
              + Crear tu primera obra
            </Link>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-6 pt-2 border-t border-kraft-200 dark:border-gray-800 text-xs font-mono">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-[#FF6A00]"></span>
            <span>Presupuesto Contratado</span>
          </div>
          {barMode === 'cobranza' ? (
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-[#6B8F72]"></span>
              <span>Recaudado a la Fecha</span>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-[#D94336]"></span>
                <span>Costos Directos</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-[#6B8F72]"></span>
                <span>Margen Bruto</span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Distribución Financiera / Pie Chart */}
      <div className="min-w-0 max-w-full overflow-hidden p-4 sm:p-5 rounded-2xl bg-white dark:bg-[#141A23] border border-kraft-200 dark:border-[#263040] shadow-sm space-y-4 flex flex-col justify-between">
        <div className="flex flex-wrap items-start justify-between gap-2 min-w-0">
          <div className="min-w-0 flex-1">
            <h3 className="font-heading font-bold text-base text-navy-900 dark:text-white">
              Distribución de Cartera
            </h3>
            <p className="text-xs text-gray-500 font-mono">
              Estado general de cobranza
            </p>
          </div>
          <button
            type="button"
            onClick={onTogglePieChart}
            aria-label={pieChartRevealed ? 'Ocultar montos de Distribución de Cartera' : 'Mostrar montos de Distribución de Cartera'}
            aria-pressed={pieChartRevealed}
            title={pieChartRevealed ? 'Ocultar montos' : 'Mostrar montos'}
            className="inline-flex items-center justify-center p-1.5 rounded-lg border border-kraft-200 dark:border-[#263040] bg-kraft-50/80 dark:bg-[#1E2633] text-gray-500 hover:text-[#FF6A00] transition-colors shrink-0"
          >
            {pieChartRevealed ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>

        <div className="h-52 w-full min-w-0 overflow-hidden flex items-center justify-center">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart aria-hidden="true" accessibilityLayer={false} tabIndex={-1}>
              <Pie
                rootTabIndex={-1}
                data={pieDataRentabilidad}
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={75}
                paddingAngle={4}
                dataKey="value"
                nameKey="name"
                isAnimationActive={false}
              >
                {pieDataRentabilidad.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <text x="50%" y="46%" textAnchor="middle" fill="#888888" fontSize={11}>
                {pieDataRentabilidad.length ? 'Total de cartera' : 'Sin movimientos'}
              </text>
              <text x="50%" y="57%" textAnchor="middle" className="fill-navy-900 dark:fill-gray-100" fontWeight={700} fontSize={14}>
                {pieChartRevealed ? compactCLP(totalCobrado + saldoPendiente) : MASKED_CLP_AMOUNT}
              </text>
              <Tooltip
                formatter={(val: number, name: string) => [
                  `${pieChartRevealed ? formatCLP(Number(val)) : MASKED_CLP_AMOUNT} · ${totalCobrado + saldoPendiente > 0 ? Math.round(Number(val) / (totalCobrado + saldoPendiente) * 100) : 0}%`,
                  name,
                ]}
                itemStyle={{ color: '#fff' }}
                labelStyle={{ color: '#fff' }}
                contentStyle={{
                  backgroundColor: '#1E1E1E',
                  border: '1px solid #333',
                  borderRadius: '8px',
                  color: '#fff',
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="space-y-2 pt-2 border-t border-kraft-200 dark:border-gray-800 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2 font-mono">
            <span className="flex items-center gap-1.5 text-gray-600 dark:text-gray-300">
              <span className="w-2.5 h-2.5 rounded-full bg-[#6B8F72]"></span>
              Total Cobrado ({totalCobrado + saldoPendiente > 0 ? Math.round(totalCobrado / (totalCobrado + saldoPendiente) * 100) : 0}%):
            </span>
            <strong className="text-[#6B8F72]">{pieChartRevealed ? formatCLP(totalCobrado) : MASKED_CLP_AMOUNT}</strong>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 font-mono">
            <span className="flex items-center gap-1.5 text-gray-600 dark:text-gray-300">
              <span className="w-2.5 h-2.5 rounded-full bg-[#FF6A00]"></span>
              Por Cobrar ({totalCobrado + saldoPendiente > 0 ? Math.round(saldoPendiente / (totalCobrado + saldoPendiente) * 100) : 0}%):
            </span>
            <strong className="text-[#FF6A00]">{pieChartRevealed ? formatCLP(saldoPendiente) : MASKED_CLP_AMOUNT}</strong>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 font-mono">
            <span className="flex items-center gap-1.5 text-gray-600 dark:text-gray-300">
              <span className="w-2.5 h-2.5 rounded-full bg-[#D94336]"></span>
              Imprevistos:
            </span>
            <strong className="text-[#D94336]">{pieChartRevealed ? formatCLP(totalImprevistos) : MASKED_CLP_AMOUNT}</strong>
          </div>
        </div>
      </div>
    </div>
  );
}
