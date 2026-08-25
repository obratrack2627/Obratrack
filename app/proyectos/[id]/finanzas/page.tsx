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
  Package,
  Trash2,
  ShoppingBag,
  Store,
} from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import Navbar from '@/components/Navbar';
import { dataService } from '@/lib/data-service';
import { Proyecto, Pago, Imprevisto, PaymentMethod, MaterialProyecto } from '@/types/database';
import { formatCLP, formatDate, formatThousands, parseThousands } from '@/lib/utils';

export default function ProyectoFinanzasPage() {
  const params = useParams();
  const projectId = params?.id as string;

  const [proyecto, setProyecto] = useState<Proyecto | null>(null);
  const [pagos, setPagos] = useState<Pago[]>([]);
  const [imprevistos, setImprevistos] = useState<Imprevisto[]>([]);
  const [materiales, setMateriales] = useState<MaterialProyecto[]>([]);
  
  // Modales
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [isImprevistoModalOpen, setIsImprevistoModalOpen] = useState(false);
  const [isMaterialModalOpen, setIsMaterialModalOpen] = useState(false);
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

  // Formulario Material
  const [nombreMat, setNombreMat] = useState('');
  const [categoriaMat, setCategoriaMat] = useState('Obra Gruesa');
  const [cantidadMat, setCantidadMat] = useState('1');
  const [unidadMat, setUnidadMat] = useState('unidades');
  const [precioUnitMat, setPrecioUnitMat] = useState('');
  const [proveedorMat, setProveedorMat] = useState('Imperial');

  const loadData = () => {
    if (!projectId) return;
    const proj = dataService.getProyectoById(projectId);
    const pays = dataService.getPagos(projectId);
    const imps = dataService.getImprevistos(projectId);
    const mats = dataService.getMaterialesProyecto(projectId);

    setProyecto(proj);
    setPagos(pays);
    setImprevistos(imps);
    setMateriales(mats);
  };

  useEffect(() => {
    loadData();
  }, [projectId]);

  const handleCreatePago = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseThousands(montoPago);
    if (parsed <= 0) return;

    dataService.createPago({
      proyecto_id: projectId,
      monto: parsed,
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
    const parsed = parseThousands(montoImprevisto);
    if (!descImprevisto.trim() || parsed <= 0) return;

    dataService.createImprevisto({
      proyecto_id: projectId,
      descripcion: descImprevisto.trim(),
      monto: parsed,
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

  const handleCreateMaterial = (e: React.FormEvent) => {
    e.preventDefault();
    if (!nombreMat.trim()) return;

    const parsedPrice = parseThousands(precioUnitMat);
    const qty = Number(cantidadMat) || 1;

    dataService.createMaterialProyecto({
      proyecto_id: projectId,
      nombre: nombreMat.trim(),
      categoria: categoriaMat,
      cantidad: qty,
      unidad: unidadMat,
      precio_unitario: parsedPrice,
      subtotal: qty * parsedPrice,
      proveedor: proveedorMat,
      comprado: false,
    });

    setIsMaterialModalOpen(false);
    setNombreMat('');
    setCantidadMat('1');
    setPrecioUnitMat('');
    loadData();
  };

  const handleToggleMaterial = (mat: MaterialProyecto) => {
    dataService.updateMaterialProyecto(mat.id, { comprado: !mat.comprado });
    loadData();
  };

  const handleDeleteMaterial = (id: string) => {
    dataService.deleteMaterialProyecto(id);
    loadData();
  };

  if (!proyecto) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center min-h-screen text-gray-500 font-sans">
        <p>Cargando información financiera del proyecto...</p>
        <Link href="/proyectos" className="mt-4 text-xs font-bold text-obra-orange hover:underline">
          &larr; Volver al listado de proyectos
        </Link>
      </div>
    );
  }

  const montoCotizado = proyecto.monto_cotizado || 0;
  const totalPagado = pagos.reduce((sum, p) => sum + Number(p.monto), 0);
  const totalImprevistos = imprevistos.reduce((sum, i) => sum + Number(i.monto), 0);
  const totalMateriales = materiales.reduce((sum, m) => sum + Number(m.subtotal || (m.cantidad * m.precio_unitario)), 0);
  const totalMaterialesComprados = materiales.filter((m) => m.comprado).reduce((sum, m) => sum + Number(m.subtotal || (m.cantidad * m.precio_unitario)), 0);
  const saldoPendiente = Math.max(0, montoCotizado - totalPagado);
  const porcentajePagado = montoCotizado > 0 ? Math.min(100, Math.round((totalPagado / montoCotizado) * 100)) : 0;

  const chartData = [
    { name: 'Pagado', value: totalPagado, color: '#6B8F72' }, // Verde Terreno
    { name: 'Por Cobrar', value: saldoPendiente, color: '#FF6A00' }, // Naranjo Obra
  ];
  if (totalImprevistos > 0) {
    chartData.push({ name: 'Imprevistos', value: totalImprevistos, color: '#D94336' });
  }

  return (
    <div className="flex-1 flex flex-col min-h-screen">
      <Navbar
        title={`Finanzas: ${proyecto.nombre}`}
        subtitle={`Control de pagos, flujo de caja, materiales e imprevistos`}
        action={
          <div className="flex items-center gap-2">
            <Link
              href={`/proyectos/${proyecto.id}/gantt`}
              className="px-3 py-1.5 bg-white border border-kraft-200 hover:bg-kraft-50 text-navy-900 text-xs font-semibold rounded-lg shadow-sm flex items-center gap-1.5 font-heading"
            >
              <GanttChartSquare className="w-3.5 h-3.5 text-obra-orange" />
              <span>Ver Carta Gantt</span>
            </Link>
            <Link
              href="/proyectos"
              className="px-3 py-1.5 bg-kraft-100 hover:bg-kraft-200 text-navy-900 text-xs font-semibold rounded-lg flex items-center gap-1.5 font-heading"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Volver</span>
            </Link>
          </div>
        }
      />

      <div className="p-6 max-w-7xl w-full mx-auto space-y-6">
        
        {/* KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white border border-kraft-200 rounded-xl p-5 shadow-sm">
            <p className="text-xs font-mono font-semibold uppercase text-gray-500">Monto Cotizado (Total)</p>
            <h3 className="text-2xl font-bold font-mono text-navy-900 mt-1">{formatCLP(montoCotizado)}</h3>
            <p className="text-[11px] text-gray-500 font-sans mt-0.5">Presupuesto acordado con el cliente</p>
          </div>

          <div className="bg-white border border-kraft-200 rounded-xl p-5 shadow-sm">
            <p className="text-xs font-mono font-semibold uppercase text-gray-500">Total Recaudado</p>
            <h3 className="text-2xl font-bold font-mono text-obra-green mt-1">{formatCLP(totalPagado)}</h3>
            <p className="text-[11px] text-gray-500 font-sans mt-0.5">{porcentajePagado}% del total presupuestado</p>
          </div>

          <div className="bg-white border border-kraft-200 rounded-xl p-5 shadow-sm">
            <p className="text-xs font-mono font-semibold uppercase text-gray-500">Saldo Por Cobrar</p>
            <h3 className="text-2xl font-bold font-mono text-obra-orange mt-1">{formatCLP(saldoPendiente)}</h3>
            <p className="text-[11px] text-gray-500 font-sans mt-0.5">Estados de pago pendientes</p>
          </div>

          <div className="bg-white border border-kraft-200 rounded-xl p-5 shadow-sm">
            <p className="text-xs font-mono font-semibold uppercase text-gray-500">Materiales & Gastos</p>
            <h3 className="text-2xl font-bold font-mono text-[#1E1E1E] mt-1">{formatCLP(totalMateriales)}</h3>
            <p className="text-[11px] text-gray-500 font-sans mt-0.5">{formatCLP(totalMaterialesComprados)} comprados</p>
          </div>
        </div>

        {/* Gráfico y Paneles de Control */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Gráfico Donut de Rentabilidad */}
          <div className="bg-white border border-kraft-200 rounded-xl p-5 shadow-sm flex flex-col justify-between items-center text-center">
            <h4 className="font-heading font-bold text-sm text-navy-900 self-start">Distribución de Flujo</h4>
            
            <div className="w-full h-48 my-2">
              {montoCotizado === 0 && totalPagado === 0 ? (
                <div className="h-full flex items-center justify-center text-xs text-gray-400 font-mono">
                  Sin montos registrados
                </div>
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
                  <span>Historial de Pagos</span>
                </h4>
                <button
                  onClick={() => setIsPaymentModalOpen(true)}
                  className="px-2.5 py-1 bg-obra-green hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors"
                >
                  + Registrar Pago
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
                  className="px-2.5 py-1 bg-obra-red hover:bg-red-700 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors"
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

        {/* Sección: Materiales & Insumos de la Obra */}
        <div className="bg-white border border-kraft-200 rounded-2xl p-6 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-kraft-200">
            <div>
              <h3 className="font-heading font-black text-lg text-navy-900 flex items-center gap-2">
                <Package className="w-5 h-5 text-obra-orange" />
                <span>Lista de Materiales & Insumos de la Obra</span>
              </h3>
              <p className="text-xs text-gray-500 font-sans mt-0.5">
                Control de compras, cantidades y proveedores (Sodimac, Construmart, Imperial, Barracas).
              </p>
            </div>
            
            <button
              onClick={() => setIsMaterialModalOpen(true)}
              className="px-4 py-2 bg-obra-orange hover:bg-obra-orange-hover text-white text-xs font-bold rounded-xl shadow-sm flex items-center gap-1.5 font-heading self-start sm:self-auto"
            >
              <Plus className="w-4 h-4" />
              <span>+ Agregar Material</span>
            </button>
          </div>

          {materiales.length === 0 ? (
            <div className="py-8 text-center text-gray-500 font-sans space-y-2">
              <ShoppingBag className="w-8 h-8 text-gray-300 mx-auto" />
              <p className="text-xs">No has agregado materiales a esta obra aún.</p>
              <button
                onClick={() => setIsMaterialModalOpen(true)}
                className="text-xs font-bold text-obra-orange hover:underline"
              >
                + Agregar el primer material
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-kraft-200 text-gray-500 font-mono text-[11px] uppercase">
                    <th className="py-2.5 px-3">Estado</th>
                    <th className="py-2.5 px-3">Material</th>
                    <th className="py-2.5 px-3">Categoría</th>
                    <th className="py-2.5 px-3 text-center">Cantidad</th>
                    <th className="py-2.5 px-3 text-right">P. Unitario</th>
                    <th className="py-2.5 px-3 text-right">Subtotal</th>
                    <th className="py-2.5 px-3">Proveedor</th>
                    <th className="py-2.5 px-3 text-center">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 font-sans">
                  {materiales.map((m) => (
                    <tr key={m.id} className="hover:bg-kraft-50/60 transition-colors">
                      <td className="py-2.5 px-3">
                        <button
                          type="button"
                          onClick={() => handleToggleMaterial(m)}
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold font-mono transition-colors ${
                            m.comprado
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {m.comprado ? '✓ Comprado' : '⏳ Pendiente'}
                        </button>
                      </td>
                      <td className="py-2.5 px-3 font-semibold text-navy-900">{m.nombre}</td>
                      <td className="py-2.5 px-3 text-gray-500 text-[11px] font-mono">{m.categoria || 'General'}</td>
                      <td className="py-2.5 px-3 text-center font-mono">
                        {m.cantidad} {m.unidad}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-gray-700">{formatCLP(m.precio_unitario)}</td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-navy-900">{formatCLP(m.subtotal)}</td>
                      <td className="py-2.5 px-3 text-gray-600 text-xs font-mono">{m.proveedor || '-'}</td>
                      <td className="py-2.5 px-3 text-center">
                        <button
                          type="button"
                          onClick={() => handleDeleteMaterial(m.id)}
                          className="p-1 text-gray-400 hover:text-red-600 rounded"
                          title="Eliminar material"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>

      {/* Modal: Registrar Pago Manual */}
      {isPaymentModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-kraft-200 rounded-3xl max-w-md w-full p-6 shadow-2xl animate-in zoom-in-95">
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
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-mono text-sm">$</span>
                  <input
                    type="text"
                    required
                    placeholder="5.000.000"
                    value={montoPago}
                    onChange={(e) => setMontoPago(formatThousands(e.target.value))}
                    className="w-full pl-8 pr-3.5 py-2 bg-kraft-50 border border-kraft-200 rounded-lg text-sm font-mono font-bold focus:outline-none focus:border-obra-green text-navy-900"
                  />
                </div>
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
                  className="px-4 py-2 bg-obra-green text-white text-xs font-bold rounded-xl font-heading shadow-sm hover:bg-emerald-700"
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
          <div className="bg-white border border-kraft-200 rounded-3xl max-w-md w-full p-6 shadow-2xl animate-in zoom-in-95">
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
                    Monto del Gasto (CLP) *
                  </label>
                  <div className="relative">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 font-mono text-xs">$</span>
                    <input
                      type="text"
                      required
                      placeholder="150.000"
                      value={montoImprevisto}
                      onChange={(e) => setMontoImprevisto(formatThousands(e.target.value))}
                      className="w-full pl-6 pr-2 py-1.5 bg-kraft-50 border border-kraft-200 rounded-lg text-xs font-mono font-bold focus:outline-none focus:border-obra-red"
                    />
                  </div>
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
                  className="px-4 py-2 bg-obra-red text-white text-xs font-bold rounded-xl font-heading shadow-sm hover:bg-red-700"
                >
                  Guardar Imprevisto
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: + Agregar Material a la Obra */}
      {isMaterialModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-kraft-200 rounded-3xl max-w-md w-full p-6 shadow-2xl animate-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-kraft-200">
              <h3 className="font-heading font-bold text-base text-navy-900 flex items-center gap-2">
                <Package className="w-4 h-4 text-obra-orange" />
                <span>Agregar Material a la Obra</span>
              </h3>
              <button onClick={() => setIsMaterialModalOpen(false)} className="text-gray-400 hover:text-gray-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateMaterial} className="space-y-4">
              <div>
                <label className="block text-xs font-mono font-semibold text-gray-700 uppercase mb-1">
                  Nombre del Material / Insumo *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ej: Cemento Polpaico Especial 25kg, Placa OSB 9.5mm..."
                  value={nombreMat}
                  onChange={(e) => setNombreMat(e.target.value)}
                  className="w-full px-3 py-2 bg-kraft-50 border border-kraft-200 rounded-lg text-xs focus:outline-none focus:border-obra-orange"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-mono font-semibold text-gray-700 uppercase mb-1">
                    Cantidad *
                  </label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={cantidadMat}
                    onChange={(e) => setCantidadMat(e.target.value)}
                    className="w-full px-3 py-2 bg-kraft-50 border border-kraft-200 rounded-lg text-xs font-mono focus:outline-none focus:border-obra-orange"
                  />
                </div>
                <div>
                  <label className="block text-xs font-mono font-semibold text-gray-700 uppercase mb-1">
                    Unidad
                  </label>
                  <select
                    value={unidadMat}
                    onChange={(e) => setUnidadMat(e.target.value)}
                    className="w-full px-3 py-2 bg-kraft-50 border border-kraft-200 rounded-lg text-xs font-mono"
                  >
                    <option value="sacos">Sacos</option>
                    <option value="placas">Placas</option>
                    <option value="tiras">Tiras</option>
                    <option value="barras">Barras</option>
                    <option value="m2">m²</option>
                    <option value="m3">m³</option>
                    <option value="kg">kg</option>
                    <option value="unidades">Unidades</option>
                    <option value="global">Global</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-mono font-semibold text-gray-700 uppercase mb-1">
                    Precio Unitario (CLP) *
                  </label>
                  <div className="relative">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 font-mono text-xs">$</span>
                    <input
                      type="text"
                      required
                      placeholder="4.490"
                      value={precioUnitMat}
                      onChange={(e) => setPrecioUnitMat(formatThousands(e.target.value))}
                      className="w-full pl-6 pr-2 py-2 bg-kraft-50 border border-kraft-200 rounded-lg text-xs font-mono font-bold focus:outline-none focus:border-obra-orange"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-mono font-semibold text-gray-700 uppercase mb-1">
                    Proveedor Sugerido
                  </label>
                  <select
                    value={proveedorMat}
                    onChange={(e) => setProveedorMat(e.target.value)}
                    className="w-full px-3 py-2 bg-kraft-50 border border-kraft-200 rounded-lg text-xs font-mono"
                  >
                    <option value="Imperial">Imperial</option>
                    <option value="Construmart">Construmart</option>
                    <option value="Sodimac">Sodimac Constructor</option>
                    <option value="Red MTS">Red MTS</option>
                    <option value="Barraca Local">Barraca Local</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-kraft-200">
                <button
                  type="button"
                  onClick={() => setIsMaterialModalOpen(false)}
                  className="px-3 py-1.5 text-xs text-gray-600 hover:text-gray-900"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-obra-orange text-white text-xs font-bold rounded-xl font-heading shadow-sm hover:bg-obra-orange-hover"
                >
                  Guardar Material
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Vista previa de Foto */}
      {previewPhoto && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-xl w-full p-4 overflow-hidden relative shadow-2xl animate-in zoom-in-95">
            <button
              onClick={() => setPreviewPhoto(null)}
              className="absolute top-3 right-3 p-1 rounded-full bg-black/50 text-white hover:bg-black"
            >
              <X className="w-5 h-5" />
            </button>
            <img src={previewPhoto} alt="Respaldo fotográfico" className="w-full h-auto max-h-[75vh] object-contain rounded-lg" />
          </div>
        </div>
      )}

    </div>
  );
}
