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
  Edit3,
  ShoppingBag,
  Store,
  MapPin,
  Sparkles,
} from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import Navbar from '@/components/Navbar';
import GoogleMapsProjectViewer from '@/components/GoogleMapsProjectViewer';
import { dataService } from '@/lib/data-service';
import { Proyecto, Pago, Imprevisto, PaymentMethod, MaterialProyecto } from '@/types/database';
import { formatCLP, formatDate, formatThousands, parseThousands } from '@/lib/utils';

export default function ProyectoFinanzasPage() {
  const params = useParams();
  const projectId = params?.id as string;

  const [proyecto, setProyecto] = useState<Proyecto | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [pagos, setPagos] = useState<Pago[]>([]);
  const [imprevistos, setImprevistos] = useState<Imprevisto[]>([]);
  const [materiales, setMateriales] = useState<MaterialProyecto[]>([]);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  
  // Modales de Creación
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [isImprevistoModalOpen, setIsImprevistoModalOpen] = useState(false);
  const [isMaterialModalOpen, setIsMaterialModalOpen] = useState(false);
  const [isMapsModalOpen, setIsMapsModalOpen] = useState(false);
  const [previewPhoto, setPreviewPhoto] = useState<string | null>(null);

  // Modales de Edición & Eliminación
  const [editingPago, setEditingPago] = useState<Pago | null>(null);
  const [pagoToDelete, setPagoToDelete] = useState<Pago | null>(null);

  const [editingImprevisto, setEditingImprevisto] = useState<Imprevisto | null>(null);
  const [imprevistoToDelete, setImprevistoToDelete] = useState<Imprevisto | null>(null);

  const [editingMaterial, setEditingMaterial] = useState<MaterialProyecto | null>(null);
  const [materialToDelete, setMaterialToDelete] = useState<MaterialProyecto | null>(null);

  // Formulario Nuevo Pago
  const [montoPago, setMontoPago] = useState('');
  const [metodoPago, setMetodoPago] = useState<PaymentMethod>('transferencia');
  const [fechaPago, setFechaPago] = useState(new Date().toISOString().split('T')[0]);
  const [notaPago, setNotaPago] = useState('');

  // Formulario Editar Pago
  const [editPagoMonto, setEditPagoMonto] = useState('');
  const [editPagoMetodo, setEditPagoMetodo] = useState<PaymentMethod>('transferencia');
  const [editPagoFecha, setEditPagoFecha] = useState('');
  const [editPagoNota, setEditPagoNota] = useState('');

  // Formulario Nuevo Imprevisto
  const [descImprevisto, setDescImprevisto] = useState('');
  const [montoImprevisto, setMontoImprevisto] = useState('');
  const [fotoUrlImprevisto, setFotoUrlImprevisto] = useState('');
  const [fechaImprevisto, setFechaImprevisto] = useState(new Date().toISOString().split('T')[0]);

  // Formulario Editar Imprevisto
  const [editImpDesc, setEditImpDesc] = useState('');
  const [editImpMonto, setEditImpMonto] = useState('');
  const [editImpFoto, setEditImpFoto] = useState('');
  const [editImpFecha, setEditImpFecha] = useState('');

  // Formulario Nuevo Material
  const [nombreMat, setNombreMat] = useState('');
  const [categoriaMat, setCategoriaMat] = useState('Obra Gruesa');
  const [cantidadMat, setCantidadMat] = useState('1');
  const [unidadMat, setUnidadMat] = useState('unidades');
  const [precioUnitMat, setPrecioUnitMat] = useState('');
  const [proveedorMat, setProveedorMat] = useState('Imperial');

  // Formulario Editar Material
  const [editMatNombre, setEditMatNombre] = useState('');
  const [editMatCategoria, setEditMatCategoria] = useState('');
  const [editMatCantidad, setEditMatCantidad] = useState('1');
  const [editMatUnidad, setEditMatUnidad] = useState('unidades');
  const [editMatPrecioUnit, setEditMatPrecioUnit] = useState('');
  const [editMatProveedor, setEditMatProveedor] = useState('Imperial');

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
    setIsLoading(false);
  };

  useEffect(() => {
    const user = dataService.getActiveUser();
    if (user?.rol === 'terreno') {
      window.location.href = `/proyectos/${projectId}/gantt`;
      return;
    }
    loadData();
  }, [projectId]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // --- CRUD PAGOS ---
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
    showToast(`Pago de ${formatCLP(parsed)} registrado.`);
  };

  const handleOpenEditPago = (p: Pago) => {
    setEditingPago(p);
    setEditPagoMonto(formatThousands(p.monto));
    setEditPagoMetodo(p.metodo);
    setEditPagoFecha(p.fecha);
    setEditPagoNota(p.nota || '');
  };

  const handleSaveEditPago = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPago) return;
    const parsed = parseThousands(editPagoMonto);
    if (parsed <= 0) return;

    dataService.updatePago(editingPago.id, {
      monto: parsed,
      metodo: editPagoMetodo,
      fecha: editPagoFecha,
      nota: editPagoNota.trim(),
    });

    setEditingPago(null);
    loadData();
    showToast(`Pago actualizado con éxito.`);
  };

  const handleConfirmDeletePago = () => {
    if (!pagoToDelete) return;
    dataService.deletePago(pagoToDelete.id);
    showToast(`Pago de ${formatCLP(pagoToDelete.monto)} eliminado.`);
    setPagoToDelete(null);
    loadData();
  };

  // --- CRUD IMPREVISTOS ---
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
    showToast(`Imprevisto de ${formatCLP(parsed)} registrado.`);
  };

  const handleOpenEditImprevisto = (imp: Imprevisto) => {
    setEditingImprevisto(imp);
    setEditImpDesc(imp.descripcion);
    setEditImpMonto(formatThousands(imp.monto));
    setEditImpFoto(imp.foto_url || '');
    setEditImpFecha(imp.fecha);
  };

  const handleSaveEditImprevisto = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingImprevisto) return;
    const parsed = parseThousands(editImpMonto);

    dataService.updateImprevisto(editingImprevisto.id, {
      descripcion: editImpDesc.trim(),
      monto: parsed,
      foto_url: editImpFoto.trim() || undefined,
      fecha: editImpFecha,
    });

    setEditingImprevisto(null);
    loadData();
    showToast(`Imprevisto actualizado con éxito.`);
  };

  const handleConfirmDeleteImprevisto = () => {
    if (!imprevistoToDelete) return;
    dataService.deleteImprevisto(imprevistoToDelete.id);
    showToast(`Imprevisto eliminado.`);
    setImprevistoToDelete(null);
    loadData();
  };

  // --- CRUD MATERIALES ---
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
    showToast(`Material "${nombreMat.trim()}" agregado a la lista.`);
  };

  const handleOpenEditMaterial = (m: MaterialProyecto) => {
    setEditingMaterial(m);
    setEditMatNombre(m.nombre);
    setEditMatCategoria(m.categoria || 'Obra Gruesa');
    setEditMatCantidad(String(m.cantidad));
    setEditMatUnidad(m.unidad);
    setEditMatPrecioUnit(formatThousands(m.precio_unitario));
    setEditMatProveedor(m.proveedor || 'Imperial');
  };

  const handleSaveEditMaterial = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMaterial || !editMatNombre.trim()) return;

    const parsedPrice = parseThousands(editMatPrecioUnit);
    const qty = Number(editMatCantidad) || 1;

    dataService.updateMaterialProyecto(editingMaterial.id, {
      nombre: editMatNombre.trim(),
      categoria: editMatCategoria,
      cantidad: qty,
      unidad: editMatUnidad,
      precio_unitario: parsedPrice,
      subtotal: qty * parsedPrice,
      proveedor: editMatProveedor,
    });

    setEditingMaterial(null);
    loadData();
    showToast(`Material "${editMatNombre.trim()}" actualizado.`);
  };

  const handleToggleMaterial = (mat: MaterialProyecto) => {
    dataService.updateMaterialProyecto(mat.id, { comprado: !mat.comprado });
    loadData();
  };

  const handleConfirmDeleteMaterial = () => {
    if (!materialToDelete) return;
    dataService.deleteMaterialProyecto(materialToDelete.id);
    showToast(`Material "${materialToDelete.nombre}" eliminado.`);
    setMaterialToDelete(null);
    loadData();
  };

  if (isLoading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center min-h-screen text-gray-500 font-sans">
        <p>Cargando información financiera del proyecto...</p>
      </div>
    );
  }

  if (!proyecto) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center min-h-screen text-gray-500 font-sans p-4">
        <div className="bg-white dark:bg-[#141A23] p-8 rounded-2xl border border-kraft-200 dark:border-[#263040] shadow-lg text-center max-w-md w-full">
          <AlertTriangle className="w-10 h-10 text-obra-orange mx-auto mb-3" />
          <h3 className="font-heading font-bold text-base text-navy-900 dark:text-white">Obra no encontrada</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">El proyecto solicitado no existe o no pertenece a tu constructora.</p>
          <Link href="/proyectos" className="mt-5 inline-flex items-center gap-1.5 px-4 py-2 bg-obra-orange text-white rounded-xl text-xs font-bold hover:bg-obra-orange-hover shadow-md transition-colors">
            &larr; Volver al listado de proyectos
          </Link>
        </div>
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
    { name: 'Pagado', value: totalPagado, color: '#6B8F72' },
    { name: 'Por Cobrar', value: saldoPendiente, color: '#FF6A00' },
  ];
  if (totalImprevistos > 0) {
    chartData.push({ name: 'Imprevistos', value: totalImprevistos, color: '#D94336' });
  }

  return (
    <div className="flex-1 flex flex-col min-h-screen">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-5 right-5 z-50 bg-navy-900 text-white border border-obra-orange/40 px-4 py-3 rounded-2xl shadow-2xl flex items-center gap-2.5 animate-in slide-in-from-bottom-5 text-xs font-semibold">
          <CheckCircle2 className="w-4 h-4 text-obra-orange" />
          <span>{toastMessage}</span>
        </div>
      )}

      <Navbar
        title={`Finanzas: ${proyecto.nombre}`}
        subtitle={`Control de pagos, flujo de caja, materiales e imprevistos`}
        action={
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsMapsModalOpen(true)}
              className="px-3 py-1.5 bg-white dark:bg-[#141A23] border border-[#E5DFC9] dark:border-[#263040] hover:border-[#FF6A00] text-navy-900 dark:text-white text-xs font-semibold rounded-lg shadow-sm flex items-center gap-1.5 font-heading"
              title="Ver ubicación en Google Maps"
            >
              <MapPin className="w-3.5 h-3.5 text-[#FF6A00]" />
              <span>Maps</span>
            </button>
            <Link
              href={`/proyectos/${proyecto.id}/gantt`}
              className="px-3 py-1.5 bg-white border border-kraft-200 hover:bg-kraft-50 text-navy-900 text-xs font-semibold rounded-lg shadow-sm flex items-center gap-1.5 font-heading"
            >
              <GanttChartSquare className="w-3.5 h-3.5 text-obra-orange" />
              <span>Ver Carta Gantt</span>
            </Link>
            <Link
              href={`/proyectos/${proyecto.id}/ia`}
              className="px-3 py-1.5 bg-gradient-to-r from-[#FF6A00]/20 to-purple-600/20 hover:from-[#FF6A00]/30 hover:to-purple-600/30 text-[#FF6A00] dark:text-[#FF8A33] border border-[#FF6A00]/40 text-xs font-semibold rounded-lg flex items-center gap-1.5 font-heading shadow-sm"
            >
              <Sparkles className="w-3.5 h-3.5 text-[#FF6A00]" />
              <span>Copiloto IA</span>
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

          {/* Historial Cronológico de Pagos (con CRUD) */}
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
                    <div key={pago.id} className="py-2.5 flex items-center justify-between text-xs gap-2">
                      <div>
                        <div className="font-mono font-bold text-navy-900">{formatCLP(pago.monto)}</div>
                        <p className="text-[11px] text-gray-500 capitalize">
                          {pago.metodo} {pago.nota ? `• ${pago.nota}` : ''}
                        </p>
                        <span className="text-[10px] font-mono text-gray-400">{formatDate(pago.fecha)}</span>
                      </div>
                      
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleOpenEditPago(pago)}
                          className="p-1 text-gray-400 hover:text-obra-orange rounded"
                          title="Editar pago"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setPagoToDelete(pago)}
                          className="p-1 text-gray-400 hover:text-red-600 rounded"
                          title="Eliminar pago"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Historial de Imprevistos con Fotos (con CRUD) */}
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

                      <div className="flex items-center gap-1 shrink-0">
                        {imp.foto_url && (
                          <button
                            onClick={() => setPreviewPhoto(imp.foto_url || null)}
                            className="w-7 h-7 rounded border border-kraft-200 overflow-hidden relative group"
                            title="Ver foto de respaldo"
                          >
                            <img
                              src={imp.foto_url}
                              alt="Evidencia"
                              className="w-full h-full object-cover group-hover:scale-110 transition-transform"
                            />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleOpenEditImprevisto(imp)}
                          className="p-1 text-gray-400 hover:text-obra-orange rounded"
                          title="Editar imprevisto"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setImprevistoToDelete(imp)}
                          className="p-1 text-gray-400 hover:text-red-600 rounded"
                          title="Eliminar imprevisto"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

        </div>

        {/* Sección: Materiales & Insumos de la Obra (con CRUD) */}
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
                    <th className="py-2.5 px-3 text-center">Acciones</th>
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
                        <div className="flex items-center justify-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleOpenEditMaterial(m)}
                            className="p-1 text-gray-400 hover:text-obra-orange rounded"
                            title="Editar material"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setMaterialToDelete(m)}
                            className="p-1 text-gray-400 hover:text-red-600 rounded"
                            title="Eliminar material"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative w-full max-w-md my-auto bg-white dark:bg-[#141A23] border border-[#E5DFC9] dark:border-[#263040] rounded-2xl sm:rounded-3xl max-h-[calc(100dvh-2rem)] overflow-y-auto p-5 sm:p-6 shadow-2xl animate-in zoom-in-95">
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
                    className="w-full pl-8 pr-3.5 py-2 bg-kraft-50 border border-kraft-200 rounded-xl text-sm font-mono font-bold focus:outline-none focus:border-obra-green text-navy-900"
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
                    className="w-full px-3 py-2 bg-kraft-50 border border-kraft-200 rounded-xl text-xs"
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
                    className="w-full px-2.5 py-1.5 bg-kraft-50 border border-kraft-200 rounded-xl text-xs font-mono"
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
                  className="w-full px-3 py-2 bg-kraft-50 border border-kraft-200 rounded-xl text-xs"
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

      {/* Modal: Editar Pago */}
      {editingPago && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative w-full max-w-md my-auto bg-white dark:bg-[#141A23] border border-[#E5DFC9] dark:border-[#263040] rounded-2xl sm:rounded-3xl max-h-[calc(100dvh-2rem)] overflow-y-auto p-5 sm:p-6 shadow-2xl animate-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-kraft-200">
              <h3 className="font-heading font-bold text-base text-navy-900 flex items-center gap-2">
                <Edit3 className="w-4 h-4 text-obra-orange" />
                <span>Editar Pago Registrado</span>
              </h3>
              <button onClick={() => setEditingPago(null)} className="text-gray-400 hover:text-gray-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEditPago} className="space-y-4">
              <div>
                <label className="block text-xs font-mono font-semibold text-gray-700 uppercase mb-1">
                  Monto Recibido (CLP) *
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-mono text-sm">$</span>
                  <input
                    type="text"
                    required
                    value={editPagoMonto}
                    onChange={(e) => setEditPagoMonto(formatThousands(e.target.value))}
                    className="w-full pl-8 pr-3.5 py-2 bg-kraft-50 border border-kraft-200 rounded-xl text-sm font-mono font-bold focus:outline-none focus:border-obra-green text-navy-900"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-mono font-semibold text-gray-700 uppercase mb-1">
                    Método de Pago
                  </label>
                  <select
                    value={editPagoMetodo}
                    onChange={(e) => setEditPagoMetodo(e.target.value as PaymentMethod)}
                    className="w-full px-3 py-2 bg-kraft-50 border border-kraft-200 rounded-xl text-xs"
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
                    value={editPagoFecha}
                    onChange={(e) => setEditPagoFecha(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-kraft-50 border border-kraft-200 rounded-xl text-xs font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-mono font-semibold text-gray-700 uppercase mb-1">
                  Nota / Observación
                </label>
                <input
                  type="text"
                  value={editPagoNota}
                  onChange={(e) => setEditPagoNota(e.target.value)}
                  className="w-full px-3 py-2 bg-kraft-50 border border-kraft-200 rounded-xl text-xs"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-kraft-200">
                <button
                  type="button"
                  onClick={() => setEditingPago(null)}
                  className="px-3 py-1.5 text-xs text-gray-600 hover:text-gray-900"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-obra-green text-white text-xs font-bold rounded-xl font-heading shadow-sm hover:bg-emerald-700"
                >
                  Guardar Cambios
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Confirmar Eliminar Pago */}
      {pagoToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative w-full max-w-sm my-auto bg-white dark:bg-[#141A23] border border-[#E5DFC9] dark:border-[#263040] rounded-2xl sm:rounded-3xl p-5 sm:p-6 shadow-2xl animate-in zoom-in-95 text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-red-100 text-red-600 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-heading font-bold text-base text-navy-900">
                ¿Eliminar pago de {formatCLP(pagoToDelete.monto)}?
              </h3>
              <p className="text-xs text-gray-500 font-sans mt-1">
                El monto se restará del total recaudado y aumentará el saldo por cobrar.
              </p>
            </div>
            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setPagoToDelete(null)}
                className="px-4 py-2 bg-kraft-100 hover:bg-kraft-200 text-navy-900 text-xs font-bold rounded-xl transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmDeletePago}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-xl shadow-sm transition-colors"
              >
                Sí, Eliminar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Registrar Imprevisto Manual */}
      {isImprevistoModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative w-full max-w-md my-auto bg-white dark:bg-[#141A23] border border-[#E5DFC9] dark:border-[#263040] rounded-2xl sm:rounded-3xl max-h-[calc(100dvh-2rem)] overflow-y-auto p-5 sm:p-6 shadow-2xl animate-in zoom-in-95">
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
                  className="w-full px-3 py-2 bg-kraft-50 border border-kraft-200 rounded-xl text-xs focus:outline-none focus:border-obra-red"
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
                      className="w-full pl-6 pr-2 py-1.5 bg-kraft-50 border border-kraft-200 rounded-xl text-xs font-mono font-bold focus:outline-none focus:border-obra-red"
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
                    className="w-full px-2.5 py-1.5 bg-kraft-50 border border-kraft-200 rounded-xl text-xs font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-mono font-semibold text-gray-700 uppercase mb-1">
                  URL Fotografía Respaldo (Opcional)
                </label>
                <input
                  type="url"
                  placeholder="https://..."
                  value={fotoUrlImprevisto}
                  onChange={(e) => setFotoUrlImprevisto(e.target.value)}
                  className="w-full px-3 py-2 bg-kraft-50 border border-kraft-200 rounded-xl text-xs"
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
                  className="px-4 py-2 bg-obra-red text-white text-xs font-bold rounded-xl font-heading shadow-sm hover:bg-red-700"
                >
                  Guardar Imprevisto
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Editar Imprevisto */}
      {editingImprevisto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative w-full max-w-md my-auto bg-white dark:bg-[#141A23] border border-[#E5DFC9] dark:border-[#263040] rounded-2xl sm:rounded-3xl max-h-[calc(100dvh-2rem)] overflow-y-auto p-5 sm:p-6 shadow-2xl animate-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-kraft-200">
              <h3 className="font-heading font-bold text-base text-navy-900 flex items-center gap-2">
                <Edit3 className="w-4 h-4 text-obra-orange" />
                <span>Editar Imprevisto</span>
              </h3>
              <button onClick={() => setEditingImprevisto(null)} className="text-gray-400 hover:text-gray-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEditImprevisto} className="space-y-4">
              <div>
                <label className="block text-xs font-mono font-semibold text-gray-700 uppercase mb-1">
                  Descripción *
                </label>
                <textarea
                  required
                  rows={2}
                  value={editImpDesc}
                  onChange={(e) => setEditImpDesc(e.target.value)}
                  className="w-full px-3 py-2 bg-kraft-50 border border-kraft-200 rounded-xl text-xs focus:outline-none focus:border-obra-red"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-mono font-semibold text-gray-700 uppercase mb-1">
                    Monto (CLP) *
                  </label>
                  <div className="relative">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 font-mono text-xs">$</span>
                    <input
                      type="text"
                      required
                      value={editImpMonto}
                      onChange={(e) => setEditImpMonto(formatThousands(e.target.value))}
                      className="w-full pl-6 pr-2 py-1.5 bg-kraft-50 border border-kraft-200 rounded-xl text-xs font-mono font-bold focus:outline-none focus:border-obra-red"
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
                    value={editImpFecha}
                    onChange={(e) => setEditImpFecha(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-kraft-50 border border-kraft-200 rounded-xl text-xs font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-mono font-semibold text-gray-700 uppercase mb-1">
                  URL Fotografía
                </label>
                <input
                  type="url"
                  value={editImpFoto}
                  onChange={(e) => setEditImpFoto(e.target.value)}
                  className="w-full px-3 py-2 bg-kraft-50 border border-kraft-200 rounded-xl text-xs"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-kraft-200">
                <button
                  type="button"
                  onClick={() => setEditingImprevisto(null)}
                  className="px-3 py-1.5 text-xs text-gray-600 hover:text-gray-900"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-obra-red text-white text-xs font-bold rounded-xl font-heading shadow-sm hover:bg-red-700"
                >
                  Guardar Cambios
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Confirmar Eliminar Imprevisto */}
      {imprevistoToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative w-full max-w-sm my-auto bg-white dark:bg-[#141A23] border border-[#E5DFC9] dark:border-[#263040] rounded-2xl sm:rounded-3xl p-5 sm:p-6 shadow-2xl animate-in zoom-in-95 text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-red-100 text-red-600 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-heading font-bold text-base text-navy-900">
                ¿Eliminar este imprevisto?
              </h3>
              <p className="text-xs text-gray-500 font-sans mt-1">
                {imprevistoToDelete.descripcion} ({formatCLP(imprevistoToDelete.monto)})
              </p>
            </div>
            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setImprevistoToDelete(null)}
                className="px-4 py-2 bg-kraft-100 hover:bg-kraft-200 text-navy-900 text-xs font-bold rounded-xl transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteImprevisto}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-xl shadow-sm transition-colors"
              >
                Sí, Eliminar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: + Agregar Material a la Obra */}
      {isMaterialModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative w-full max-w-md my-auto bg-white dark:bg-[#141A23] border border-[#E5DFC9] dark:border-[#263040] rounded-2xl sm:rounded-3xl max-h-[calc(100dvh-2rem)] overflow-y-auto p-5 sm:p-6 shadow-2xl animate-in zoom-in-95">
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
                  className="w-full px-3 py-2 bg-kraft-50 border border-kraft-200 rounded-xl text-xs focus:outline-none focus:border-obra-orange"
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
                    className="w-full px-3 py-2 bg-kraft-50 border border-kraft-200 rounded-xl text-xs font-mono focus:outline-none focus:border-obra-orange"
                  />
                </div>
                <div>
                  <label className="block text-xs font-mono font-semibold text-gray-700 uppercase mb-1">
                    Unidad
                  </label>
                  <select
                    value={unidadMat}
                    onChange={(e) => setUnidadMat(e.target.value)}
                    className="w-full px-3 py-2 bg-kraft-50 border border-kraft-200 rounded-xl text-xs font-mono"
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
                      className="w-full pl-6 pr-2 py-2 bg-kraft-50 border border-kraft-200 rounded-xl text-xs font-mono font-bold focus:outline-none focus:border-obra-orange"
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
                    className="w-full px-3 py-2 bg-kraft-50 border border-kraft-200 rounded-xl text-xs font-mono"
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

      {/* Modal: Editar Material */}
      {editingMaterial && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative w-full max-w-md my-auto bg-white dark:bg-[#141A23] border border-[#E5DFC9] dark:border-[#263040] rounded-2xl sm:rounded-3xl max-h-[calc(100dvh-2rem)] overflow-y-auto p-5 sm:p-6 shadow-2xl animate-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-kraft-200">
              <h3 className="font-heading font-bold text-base text-navy-900 flex items-center gap-2">
                <Edit3 className="w-4 h-4 text-obra-orange" />
                <span>Editar Insumo / Material</span>
              </h3>
              <button onClick={() => setEditingMaterial(null)} className="text-gray-400 hover:text-gray-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEditMaterial} className="space-y-4">
              <div>
                <label className="block text-xs font-mono font-semibold text-gray-700 uppercase mb-1">
                  Nombre del Material *
                </label>
                <input
                  type="text"
                  required
                  value={editMatNombre}
                  onChange={(e) => setEditMatNombre(e.target.value)}
                  className="w-full px-3 py-2 bg-kraft-50 border border-kraft-200 rounded-xl text-xs focus:outline-none focus:border-obra-orange font-semibold"
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
                    value={editMatCantidad}
                    onChange={(e) => setEditMatCantidad(e.target.value)}
                    className="w-full px-3 py-2 bg-kraft-50 border border-kraft-200 rounded-xl text-xs font-mono focus:outline-none focus:border-obra-orange"
                  />
                </div>
                <div>
                  <label className="block text-xs font-mono font-semibold text-gray-700 uppercase mb-1">
                    Unidad
                  </label>
                  <select
                    value={editMatUnidad}
                    onChange={(e) => setEditMatUnidad(e.target.value)}
                    className="w-full px-3 py-2 bg-kraft-50 border border-kraft-200 rounded-xl text-xs font-mono"
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
                      value={editMatPrecioUnit}
                      onChange={(e) => setEditMatPrecioUnit(formatThousands(e.target.value))}
                      className="w-full pl-6 pr-2 py-2 bg-kraft-50 border border-kraft-200 rounded-xl text-xs font-mono font-bold focus:outline-none focus:border-obra-orange"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-mono font-semibold text-gray-700 uppercase mb-1">
                    Proveedor
                  </label>
                  <select
                    value={editMatProveedor}
                    onChange={(e) => setEditMatProveedor(e.target.value)}
                    className="w-full px-3 py-2 bg-kraft-50 border border-kraft-200 rounded-xl text-xs font-mono"
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
                  onClick={() => setEditingMaterial(null)}
                  className="px-3 py-1.5 text-xs text-gray-600 hover:text-gray-900"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-obra-orange text-white text-xs font-bold rounded-xl font-heading shadow-sm hover:bg-obra-orange-hover"
                >
                  Guardar Cambios
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Confirmar Eliminar Material */}
      {materialToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative w-full max-w-sm my-auto bg-white dark:bg-[#141A23] border border-[#E5DFC9] dark:border-[#263040] rounded-2xl sm:rounded-3xl p-5 sm:p-6 shadow-2xl animate-in zoom-in-95 text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-red-100 text-red-600 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-heading font-bold text-base text-navy-900">
                ¿Eliminar material &quot;{materialToDelete.nombre}&quot;?
              </h3>
              <p className="text-xs text-gray-500 font-sans mt-1">
                Se restará de la lista de insumos y costos del proyecto.
              </p>
            </div>
            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setMaterialToDelete(null)}
                className="px-4 py-2 bg-kraft-100 hover:bg-kraft-200 text-navy-900 text-xs font-bold rounded-xl transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteMaterial}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-xl shadow-sm transition-colors"
              >
                Sí, Eliminar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Vista previa de Foto */}
      {previewPhoto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative w-full max-w-xl my-auto bg-white dark:bg-[#141A23] rounded-2xl p-4 overflow-hidden shadow-2xl animate-in zoom-in-95">
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

      {/* Modal: Visor Google Maps de la Obra */}
      <GoogleMapsProjectViewer
        proyecto={proyecto}
        isOpen={isMapsModalOpen}
        onClose={() => setIsMapsModalOpen(false)}
      />

    </div>
  );
}
