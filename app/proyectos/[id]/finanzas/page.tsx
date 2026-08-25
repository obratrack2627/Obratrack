'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  ArrowLeft,
  DollarSign,
  Plus,
  GanttChartSquare,
  AlertTriangle,
  CheckCircle2,
  Calendar,
  CreditCard,
  Image as ImageIcon,
  X,
} from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import Navbar from '@/components/Navbar';
import { dataService } from '@/lib/data-service';
import { Proyecto, Pago, Imprevisto, PaymentMethod } from '@/types/database';
import { formatCLP, formatDate } from '@/lib/utils';

export default function ProyectoFinanzasPage() {
  const params = useParams();
  const projectId = params?.id as string;

  const [proyecto, setProyecto] = useState<Proyecto | null>(null);
  const [pagos, setPagos] = useState<Pago[]>([]);
  const [imprevistos, setImprevistos] = useState<Imprevisto[]>([]);
  
  // Modales
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [isImprevistoModalOpen, setIsImprevistoModalOpen] = useState(false);
  const [previewPhoto, setPreviewPhoto] = useState<string | null>(null);

  // Formulario Pago
  const [montoPago, setMontoPago] = useState('');
  const [metodoPago, setMetodoPago] = useState<PaymentMethod>('transferencia');
  const [fechaPago, setFechaPago] = useState(new Date().toISOString().split('T')[0]);
  const [notaPago, setNotaPago] = useState('');

  // Formulario Imprevisto
  const [descImprevisto, setDescImprevisto] = useState('');
  const [montoImprevisto, setMontoImprevisto] = useState('');
  const [fotoUrlImprevisto, setFotoUrlImprevisto] = useState('');
  const [fechaImprevisto, setFechaImprevisto] = useState(new Date().toISOString().split('T')[0]);

  const loadData = () => {
    if (!projectId) return;
    const proj = dataService.getProyectoById(projectId);
    const pays = dataService.getPagos(projectId);
    const imps = dataService.getImprevistos(projectId);

    setProyecto(proj);
    setPagos(pays);
    setImprevistos(imps);
  };

  useEffect(() => {
    loadData();
  }, [projectId]);

  const handleCreatePago = (e: React.FormEvent) => {
    e.preventDefault();
    if (!montoPago) return;

    dataService.createPago({
      proyecto_id: projectId,
      monto: Number(montoPago),
      metodo: metodoPago,
      fecha: fechaPago,
      nota: notaPago.trim(),
    });

    setIsPaymentModalOpen(false);
    setMontoPago('');
    setNotaPago('');
    loadData();
  };

  const handleCreateImprevisto = (e: React.FormEvent) => {
    e.preventDefault();
    if (!descImprevisto) return;

    dataService.createImprevisto({
      proyecto_id: projectId,
      descripcion: descImprevisto.trim(),
      monto: Number(montoImprevisto) || 0,
      foto_url: fotoUrlImprevisto.trim() || undefined,
      fecha: fechaImprevisto,
      origen: 'manual',
    });

    setIsImprevistoModalOpen(false);
    setDescImprevisto('');
    setMontoImprevisto('');
    setFotoUrlImprevisto('');
    loadData();
  };

  if (!proyecto) {
    return <div className="p-8 text-center text-gray-500">Cargando datos financieros...</div>;
  }

  const cotizado = proyecto.monto_cotizado || 0;
  const totalPagado = pagos.reduce((sum, p) => sum + Number(p.monto), 0);
  const totalImprevistos = imprevistos.reduce((sum, i) => sum + Number(i.monto), 0);
  const saldoPendiente = Math.max(0, cotizado - totalPagado);

  // Datos para Recharts Donut Chart
  const chartData = [
    { name: 'Cobrado', value: totalPagado, color: '#2F855A' },
    { name: 'Saldo Por Cobrar', value: saldoPendiente, color: '#E8630A' },
    { name: 'Imprevistos Detectados', value: totalImprevistos, color: '#B23A2E' },
  ].filter((d) => d.value > 0);

  return (
    <div className="flex-1 flex flex-col min-h-screen">
      <Navbar
        title={`Finanzas: ${proyecto.nombre}`}
        subtitle={`Control de pagos, estados de cuenta e imprevistos • ${proyecto.cliente?.nombre || 'Cliente'}`}
        action={
          <div className="flex items-center gap-2">
            <Link
              href={`/proyectos/${projectId}/gantt`}
              className="px-3 py-2 bg-white border border-kraft-200 text-navy-900 text-xs font-semibold rounded-lg shadow-sm flex items-center gap-1.5 hover:bg-kraft-50"
            >
              <GanttChartSquare className="w-3.5 h-3.5 text-navy-800" />
              <span>Ver Gantt</span>
            </Link>
            <button
              onClick={() => setIsPaymentModalOpen(true)}
              className="px-3.5 py-2 bg-obra-green hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg shadow-sm flex items-center gap-1.5 font-heading"
            >
              <Plus className="w-4 h-4" />
              <span>Registrar Pago</span>
            </button>
          </div>
        }
      />

      <div className="p-6 max-w-7xl w-full mx-auto space-y-6">
        
        {/* Sub-Header con Botón Volver */}
        <div className="flex items-center justify-between bg-white border border-kraft-200 p-4 rounded-xl shadow-sm">
          <Link
            href="/proyectos"
            className="text-xs font-semibold text-gray-600 hover:text-navy-900 flex items-center gap-1 font-heading"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Volver a Proyectos</span>
          </Link>
          <span className="text-xs font-mono text-gray-500">
            Moneda: <strong>Pesos Chilenos (CLP)</strong>
          </span>
        </div>

        {/* Resumen Financiero en 4 Tarjetas */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white border border-kraft-200 rounded-xl p-5 shadow-sm">
            <p className="text-xs font-mono font-semibold uppercase text-gray-500">Monto Cotizado</p>
            <h3 className="text-xl font-bold font-mono text-navy-900 mt-1">{formatCLP(cotizado)}</h3>
            <p className="text-[11px] text-gray-500 mt-0.5">Contrato con el cliente</p>
          </div>

          <div className="bg-white border border-kraft-200 rounded-xl p-5 shadow-sm">
            <p className="text-xs font-mono font-semibold uppercase text-gray-500">Total Pagado</p>
            <h3 className="text-xl font-bold font-mono text-obra-green mt-1">{formatCLP(totalPagado)}</h3>
            <p className="text-[11px] text-gray-500 mt-0.5">
              {cotizado > 0 ? Math.round((totalPagado / cotizado) * 100) : 0}% recaudado
            </p>
          </div>

          <div className="bg-white border border-kraft-200 rounded-xl p-5 shadow-sm">
            <p className="text-xs font-mono font-semibold uppercase text-gray-500">Saldo Pendiente</p>
            <h3 className="text-xl font-bold font-mono text-obra-orange mt-1">{formatCLP(saldoPendiente)}</h3>
            <p className="text-[11px] text-gray-500 mt-0.5">Por cobrar según avance</p>
          </div>

          <div className="bg-white border border-kraft-200 rounded-xl p-5 shadow-sm">
            <p className="text-xs font-mono font-semibold uppercase text-gray-500">Total Imprevistos</p>
            <h3 className="text-xl font-bold font-mono text-obra-red mt-1">{formatCLP(totalImprevistos)}</h3>
            <p className="text-[11px] text-gray-500 mt-0.5">{imprevistos.length} incidentes de costo</p>
          </div>
        </div>

        {/* Gráfico Donut de Cobro & Desglose */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Gráfico Recharts */}
          <div className="bg-white border border-kraft-200 rounded-xl p-5 shadow-sm flex flex-col items-center justify-center">
            <h4 className="font-heading font-bold text-sm text-navy-900 mb-2 w-full text-left">
              Distribución Financiera
            </h4>
            <div className="w-full h-52 flex items-center justify-center">
              {chartData.length === 0 ? (
                <p className="text-xs text-gray-400">Sin datos financieros</p>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={chartData}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={80}
                      paddingAngle={4}
                      dataKey="value"
                    >
                      {chartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value: number) => [formatCLP(value), '']} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
            
            {/* Leyenda */}
            <div className="w-full space-y-1 text-xs font-mono pt-2 border-t border-kraft-200">
              <div className="flex justify-between items-center text-obra-green">
                <span>● Cobrado:</span>
                <span>{formatCLP(totalPagado)}</span>
              </div>
              <div className="flex justify-between items-center text-obra-orange">
                <span>● Por Cobrar:</span>
                <span>{formatCLP(saldoPendiente)}</span>
              </div>
              {totalImprevistos > 0 && (
                <div className="flex justify-between items-center text-obra-red">
                  <span>● Imprevistos:</span>
                  <span>{formatCLP(totalImprevistos)}</span>
                </div>
              )}
            </div>
          </div>

          {/* Historial Cronológico de Pagos */}
          <div className="bg-white border border-kraft-200 rounded-xl p-5 shadow-sm flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-heading font-bold text-sm text-navy-900 flex items-center gap-1.5">
                  <CreditCard className="w-4 h-4 text-obra-green" />
                  <span>Historial de Pagos Recibidos</span>
                </h4>
                <button
                  onClick={() => setIsPaymentModalOpen(true)}
                  className="text-xs text-obra-green font-semibold hover:underline"
                >
                  + Agregar
                </button>
              </div>

              <div className="divide-y divide-kraft-200/80 max-h-64 overflow-y-auto pr-1">
                {pagos.length === 0 ? (
                  <p className="text-xs text-gray-500 py-6 text-center">No se han registrado pagos.</p>
                ) : (
                  pagos.map((pago) => (
                    <div key={pago.id} className="py-2.5 flex items-center justify-between text-xs">
                      <div>
                        <div className="font-mono font-bold text-navy-900">{formatCLP(pago.monto)}</div>
                        <p className="text-[11px] text-gray-500 capitalize">
                          {pago.metodo} {pago.nota ? `• ${pago.nota}` : ''}
                        </p>
                      </div>
                      <span className="text-[10px] font-mono text-gray-400">{formatDate(pago.fecha)}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Historial de Imprevistos con Fotos */}
          <div className="bg-white border border-kraft-200 rounded-xl p-5 shadow-sm flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-heading font-bold text-sm text-navy-900 flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-obra-red" />
                  <span>Imprevistos de Costo</span>
                </h4>
                <button
                  onClick={() => setIsImprevistoModalOpen(true)}
                  className="text-xs text-obra-red font-semibold hover:underline"
                >
                  + Reportar
                </button>
              </div>

              <div className="divide-y divide-kraft-200/80 max-h-64 overflow-y-auto pr-1">
                {imprevistos.length === 0 ? (
                  <p className="text-xs text-gray-500 py-6 text-center">Sin imprevistos registrados.</p>
                ) : (
                  imprevistos.map((imp) => (
                    <div key={imp.id} className="py-2.5 flex items-start justify-between gap-2 text-xs">
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono font-bold text-obra-red">{formatCLP(imp.monto)}</span>
                          <span className="text-[9px] font-mono uppercase bg-kraft-100 text-gray-600 px-1 py-0.2 rounded">
                            {imp.origen === 'whatsapp_ia' ? 'WhatsApp IA' : 'Manual'}
                          </span>
                        </div>
                        <p className="text-[11px] text-gray-700 leading-tight">{imp.descripcion}</p>
                        <span className="text-[10px] font-mono text-gray-400">{formatDate(imp.fecha)}</span>
                      </div>

                      {imp.foto_url && (
                        <button
                          onClick={() => setPreviewPhoto(imp.foto_url || null)}
                          className="flex-shrink-0 w-8 h-8 rounded border border-kraft-200 overflow-hidden relative group"
                          title="Ver foto de respaldo"
                        >
                          <img
                            src={imp.foto_url}
                            alt="Evidencia"
                            className="w-full h-full object-cover group-hover:scale-110 transition-transform"
                          />
                        </button>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

        </div>

      </div>

      {/* Modal: Registrar Pago Manual */}
      {isPaymentModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-kraft-200 rounded-2xl max-w-md w-full p-6 shadow-2xl animate-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-kraft-200">
              <h3 className="font-heading font-bold text-base text-navy-900 flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-obra-green" />
                <span>Registrar Pago del Cliente</span>
              </h3>
              <button onClick={() => setIsPaymentModalOpen(false)} className="text-gray-400 hover:text-gray-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreatePago} className="space-y-4">
              <div>
                <label className="block text-xs font-mono font-semibold text-gray-700 uppercase mb-1">
                  Monto Recibido (CLP) *
                </label>
                <input
                  type="number"
                  required
                  placeholder="Ej: 5000000"
                  value={montoPago}
                  onChange={(e) => setMontoPago(e.target.value)}
                  className="w-full px-3 py-2 bg-kraft-50 border border-kraft-200 rounded-lg text-sm font-mono focus:outline-none focus:border-obra-green"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-mono font-semibold text-gray-700 uppercase mb-1">
                    Método de Pago
                  </label>
                  <select
                    value={metodoPago}
                    onChange={(e) => setMetodoPago(e.target.value as PaymentMethod)}
                    className="w-full px-3 py-2 bg-kraft-50 border border-kraft-200 rounded-lg text-xs"
                  >
                    <option value="transferencia">Transferencia Bancaria</option>
                    <option value="efectivo">Efectivo</option>
                    <option value="debito">Tarjeta / Débito</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-mono font-semibold text-gray-700 uppercase mb-1">
                    Fecha
                  </label>
                  <input
                    type="date"
                    required
                    value={fechaPago}
                    onChange={(e) => setFechaPago(e.target.value)}
                    className="w-full px-2 py-1.5 bg-kraft-50 border border-kraft-200 rounded-lg text-xs font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-mono font-semibold text-gray-700 uppercase mb-1">
                  Nota / Estado de Pago
                </label>
                <input
                  type="text"
                  placeholder="Ej: Anticipo 50%, Estado de Pago N° 2"
                  value={notaPago}
                  onChange={(e) => setNotaPago(e.target.value)}
                  className="w-full px-3 py-2 bg-kraft-50 border border-kraft-200 rounded-lg text-xs"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-kraft-200">
                <button
                  type="button"
                  onClick={() => setIsPaymentModalOpen(false)}
                  className="px-3 py-1.5 text-xs text-gray-600 hover:text-gray-900"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-obra-green text-white text-xs font-semibold rounded-lg font-heading shadow-sm"
                >
                  Guardar Pago
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Registrar Imprevisto Manual */}
      {isImprevistoModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-kraft-200 rounded-2xl max-w-md w-full p-6 shadow-2xl animate-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-kraft-200">
              <h3 className="font-heading font-bold text-base text-navy-900 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-obra-red" />
                <span>Registrar Imprevisto / Costo Extra</span>
              </h3>
              <button onClick={() => setIsImprevistoModalOpen(false)} className="text-gray-400 hover:text-gray-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateImprevisto} className="space-y-4">
              <div>
                <label className="block text-xs font-mono font-semibold text-gray-700 uppercase mb-1">
                  Descripción del Imprevisto *
                </label>
                <textarea
                  required
                  rows={2}
                  placeholder="Ej: Rotura de cañería oculta, refuerzo estructural no contemplado..."
                  value={descImprevisto}
                  onChange={(e) => setDescImprevisto(e.target.value)}
                  className="w-full px-3 py-2 bg-kraft-50 border border-kraft-200 rounded-lg text-xs focus:outline-none focus:border-obra-red"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-mono font-semibold text-gray-700 uppercase mb-1">
                    Costo Estimado (CLP)
                  </label>
                  <input
                    type="number"
                    placeholder="Ej: 150000"
                    value={montoImprevisto}
                    onChange={(e) => setMontoImprevisto(e.target.value)}
                    className="w-full px-3 py-2 bg-kraft-50 border border-kraft-200 rounded-lg text-xs font-mono focus:outline-none focus:border-obra-red"
                  />
                </div>
                <div>
                  <label className="block text-xs font-mono font-semibold text-gray-700 uppercase mb-1">
                    Fecha
                  </label>
                  <input
                    type="date"
                    required
                    value={fechaImprevisto}
                    onChange={(e) => setFechaImprevisto(e.target.value)}
                    className="w-full px-2 py-1.5 bg-kraft-50 border border-kraft-200 rounded-lg text-xs font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-mono font-semibold text-gray-700 uppercase mb-1">
                  URL de Foto de Respaldo (opcional)
                </label>
                <input
                  type="text"
                  placeholder="https://..."
                  value={fotoUrlImprevisto}
                  onChange={(e) => setFotoUrlImprevisto(e.target.value)}
                  className="w-full px-3 py-2 bg-kraft-50 border border-kraft-200 rounded-lg text-xs"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-kraft-200">
                <button
                  type="button"
                  onClick={() => setIsImprevistoModalOpen(false)}
                  className="px-3 py-1.5 text-xs text-gray-600 hover:text-gray-900"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-obra-red text-white text-xs font-semibold rounded-lg font-heading shadow-sm"
                >
                  Registrar Imprevisto
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal / Preview de Foto */}
      {previewPhoto && (
        <div
          className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
          onClick={() => setPreviewPhoto(null)}
        >
          <div className="max-w-2xl max-h-[85vh] relative">
            <img src={previewPhoto} alt="Foto de imprevisto" className="rounded-xl max-h-[85vh] object-contain shadow-2xl" />
            <button
              onClick={() => setPreviewPhoto(null)}
              className="absolute top-3 right-3 bg-black/70 text-white p-1.5 rounded-full"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
