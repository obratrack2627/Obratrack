'use client';
import { chileToday } from '@/lib/ai/project-deadlines';

import MaskedMoneyAmount from "@/components/MaskedMoneyAmount";
import ActionMenu from '@/components/ActionMenu';
import ProjectMaterials from '@/components/ProjectMaterials';
import CompactSummary from '@/components/CompactSummary';
import ModalOverlay from '@/components/ModalOverlay';
import { MASKED_CLP_AMOUNT } from '@/lib/privacy/mask';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  ArrowLeft,
  DollarSign,
  Eye,
  EyeOff,
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
  FileSpreadsheet,
  FileText,
  Loader2,
  Clock,
} from 'lucide-react';
import dynamic from 'next/dynamic';
import Navbar from '@/components/Navbar';

const ProjectFinanzasPieChart = dynamic(
  () => import('@/components/ProjectFinanzasPieChart'),
  {
    ssr: false,
    loading: () => (
      <div className="h-full w-full animate-pulse rounded-xl bg-gray-100 dark:bg-[#1E2633]" />
    ),
  },
);

const ProjectCashflowChart = dynamic(
  () => import('@/components/ProjectCashflowChart'),
  {
    ssr: false,
    loading: () => (
      <div className="h-56 w-full animate-pulse rounded-xl bg-gray-100 dark:bg-[#1E2633]" />
    ),
  },
);

const EstadoPagoPdfModal = dynamic(
  () => import('@/components/EstadoPagoPdfModal'),
  { ssr: false },
);
import GoogleMapsProjectViewer from '@/components/GoogleMapsProjectViewer';
import ProjectTabsHeader from '@/components/ProjectTabsHeader';
import { ProjectWorkspaceSkeleton } from '@/components/PageSkeletons';
import { toast } from '@/components/ToastProvider';
import { downloadExecutiveProjectPdf } from '@/lib/reports/executive-project-pdf';
import { dataService } from '@/lib/data-service';
import {
  Proyecto,
  Pago,
  Imprevisto,
  PaymentMethod,
  MaterialProyecto,
  Cliente,
  Actividad,
  ReclamoCambioObra,
} from '@/types/database';
import { downloadProjectExcel } from '@/lib/excel-export';
import MaterialCatalogQuickSearch from '@/components/MaterialCatalogQuickSearch';
import { formatCLP, formatDate, formatThousands, parseThousands } from '@/lib/utils';
import { materialPurchasePaymentPatch } from '@/lib/construction-workflow';
import { MATERIAL_CATEGORY_LABELS } from '@/lib/materials/format';

export default function ProyectoFinanzasPage() {
  const params = useParams();
  const projectId = params?.id as string;

  const [proyecto, setProyecto] = useState<Proyecto | null>(null);
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [pagos, setPagos] = useState<Pago[]>([]);
  const [imprevistos, setImprevistos] = useState<Imprevisto[]>([]);
  const [materiales, setMateriales] = useState<MaterialProyecto[]>([]);
  const [financeSection, setFinanceSection] = useState('resumen');
  const [flowChartRevealed, setFlowChartRevealed] = useState(false);
  const [expenseCatFilter, setExpenseCatFilter] = useState<'todos' | 'mano_obra' | 'imprevisto' | 'gasto_general'>('todos');
  const [expensePaidFilter, setExpensePaidFilter] = useState<'todos' | 'pendiente' | 'pagado'>('todos');
  const submitLockRef = React.useRef(false);

  useEffect(() => {
    if (!flowChartRevealed) return;
    const timer = window.setTimeout(() => setFlowChartRevealed(false), 30000);
    return () => window.clearTimeout(timer);
  }, [flowChartRevealed]);
  
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
  const [fechaPago, setFechaPago] = useState(chileToday());
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
  const [fechaImprevisto, setFechaImprevisto] = useState(chileToday());
  const [costCategory,setCostCategory]=useState<Imprevisto['categoria_gasto']>('imprevisto');
  const [costWorker,setCostWorker]=useState('');
  const [costPaid,setCostPaid]=useState<boolean|null>(null);
  const [editCostCategory,setEditCostCategory]=useState<Imprevisto['categoria_gasto']>('imprevisto');
  const [editCostWorker,setEditCostWorker]=useState('');
  const [editCostPaid,setEditCostPaid]=useState<boolean|null>(null);


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
  const [actividadMat,setActividadMat]=useState('');
  const [editActividadMat,setEditActividadMat]=useState('');
  const [proveedorMat, setProveedorMat] = useState('Imperial');

  // Formulario Editar Material
  const [editMatNombre, setEditMatNombre] = useState('');
  const [editMatCategoria, setEditMatCategoria] = useState('');
  const [editMatCantidad, setEditMatCantidad] = useState('1');
  const [editMatUnidad, setEditMatUnidad] = useState('unidades');
  const [editMatPrecioUnit, setEditMatPrecioUnit] = useState('');
  const [editMatProveedor, setEditMatProveedor] = useState('');
  const [editMatComprado, setEditMatComprado] = useState(false);
  const [editMatPagado, setEditMatPagado] = useState<boolean | null>(null);
  const [actividades, setActividades] = useState<Actividad[]>([]);
  const [cambios, setCambios] = useState<ReclamoCambioObra[]>([]);
  const [isEdpModalOpen, setIsEdpModalOpen] = useState(false);
  const [isExportingExcel, setIsExportingExcel] = useState(false);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);

  const handleUploadImprevistoPhoto = async (
    file: File | undefined,
    setter: (url: string) => void,
  ) => {
    if (!file || !projectId) return;
    setIsUploadingPhoto(true);
    try {
      const res = await dataService.uploadArchivoObra(file, projectId, 'bitacora-fotos');
      setter(res.publicUrl);
      showToast('Fotografía de respaldo cargada.');
    } catch {
      showToast('No se pudo cargar la fotografía.');
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  const loadData = () => {
    if (!projectId) return;
    const proj = dataService.getProyectoById(projectId);
    const cli = proj?.cliente_id ? dataService.getClienteById(proj.cliente_id) : null;
    const pays = dataService.getPagos(projectId);
    const imps = dataService.getImprevistos(projectId);
    const mats = dataService.getMaterialesProyecto(projectId);

    setProyecto(proj);
    setCliente(cli || null);
    setPagos(pays);
    setImprevistos(imps);
    setMateriales(mats);
    setActividades(dataService.getActividades(projectId));
    setCambios(dataService.getReclamosCambios(projectId));
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

  useEffect(() => {
    const onSync = () => loadData();
    window.addEventListener('obratrack_cloud_synced', onSync);
    return () => window.removeEventListener('obratrack_cloud_synced', onSync);
  }, [projectId]);

  const showToast = (msg: string) => {
    toast(msg);
  };

  const handleMarkExpensePaid = async (imp: Imprevisto) => {
    dataService.updateImprevisto(imp.id, { pagado: true });
    loadData();
    try {
      await dataService.confirmarCambios();
      showToast('Gasto marcado como pagado.');
    } catch (error) {
      showToast(
        error instanceof Error
          ? error.message
          : 'Pago de gasto guardado localmente; pendiente de sincronización.',
      );
    } finally {
      loadData();
    }
  };

  const handleDownloadExecutivePdf = () => {
    if (!proyecto) return;
    const empresa = dataService.getEmpresa();
    downloadExecutiveProjectPdf({
      proyecto,
      cliente,
      empresaNombre: empresa?.nombre,
      empresaRut: empresa?.rut,
      empresaLogoUrl: empresa?.logo_url,
      actividades,
      bitacora: dataService.getBitacora(projectId),
    });
    showToast('Informe Ejecutivo PDF descargado.');
  };

  const handleExportExcel = async () => {
    if (!proyecto || isExportingExcel) return;
    setIsExportingExcel(true);
    try {
      const activeUser = dataService.getActiveUser();
      await downloadProjectExcel({
        proyecto,
        cliente,
        empresaNombre: activeUser?.empresa_nombre || 'Constructora ObraTrack',
        actividades,
        pagos,
        materiales,
        imprevistos,
        asistencias: dataService.getAsistencias(projectId),
      });
      showToast('Cartola Excel (.xlsx) descargada correctamente.');
    } catch (err) {
      console.error(err);
      showToast('No se pudo generar el archivo Excel.');
    } finally {
      setIsExportingExcel(false);
    }
  };

  const handleRegistrarPagoDesdeEdp = (monto: number, nota: string) => {
    if (submitLockRef.current || monto <= 0) return;
    submitLockRef.current = true;
    try {
      dataService.createPago({
        proyecto_id: projectId,
        monto,
        metodo: 'transferencia',
        fecha: chileToday(),
        nota,
      });
      loadData();
      showToast(`Estado de pago registrado por ${formatCLP(monto)}.`);
    } finally {
      setTimeout(() => { submitLockRef.current = false; }, 500);
    }
  };

  // --- CRUD PAGOS ---
  const handleCreatePago = (e: React.FormEvent) => {
    e.preventDefault();
    if (submitLockRef.current) return;
    const parsed = parseThousands(montoPago);
    if (parsed <= 0) return;

    submitLockRef.current = true;
    try {
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
    } finally {
      setTimeout(() => { submitLockRef.current = false; }, 500);
    }
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

  const handleConfirmDeletePago = async () => {
    if (!pagoToDelete) return;
    dataService.deletePago(pagoToDelete.id);
    try { await dataService.confirmarCambios(); showToast('Eliminación guardada.'); }
    catch(error) { showToast(error instanceof Error ? error.message : 'Eliminación pendiente de sincronización.'); }
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
      categoria_gasto: costCategory,
      usuario_id: costWorker || undefined,
      pagado: costPaid,
      monto: parsed,
      foto_url: fotoUrlImprevisto.trim() || undefined,
      fecha: fechaImprevisto,
      origen: 'manual',
    });

    setIsImprevistoModalOpen(false);
    setDescImprevisto('');
    setMontoImprevisto('');
    setFotoUrlImprevisto('');
    setCostCategory('imprevisto');
    setCostWorker('');
    setCostPaid(null);
    loadData();
    showToast(`Imprevisto de ${formatCLP(parsed)} registrado.`);
  };

  const handleOpenEditImprevisto = (imp: Imprevisto) => {
    setEditingImprevisto(imp);
    setEditCostCategory(imp.categoria_gasto || 'imprevisto');setEditCostWorker(imp.usuario_id || '');setEditCostPaid(imp.pagado ?? null);
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
      categoria_gasto: editCostCategory,
      usuario_id: editCostWorker || undefined,
      pagado: editCostPaid,
      monto: parsed,
      foto_url: editImpFoto.trim() || undefined,
      fecha: editImpFecha,
    });

    setEditingImprevisto(null);
    loadData();
    showToast(`Imprevisto actualizado con éxito.`);
  };

  const handleConfirmDeleteImprevisto = async () => {
    if (!imprevistoToDelete) return;
    dataService.deleteImprevisto(imprevistoToDelete.id);
    try { await dataService.confirmarCambios(); showToast('Eliminación guardada.'); }
    catch(error) { showToast(error instanceof Error ? error.message : 'Eliminación pendiente de sincronización.'); }
    setImprevistoToDelete(null);
    loadData();
  };

  // --- CRUD MATERIALES ---
  const handleCreateMaterial = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nombreMat.trim()) return;

    const parsedPrice = parseThousands(precioUnitMat);
    const qty = Number(cantidadMat);
    if (!Number.isFinite(qty) || qty <= 0) {
      showToast('Ingresa una cantidad válida mayor a 0.');
      return;
    }

    const createdName = nombreMat.trim();
    dataService.createMaterialProyecto({
      proyecto_id: projectId,
      nombre: createdName,
      categoria: categoriaMat.trim() || 'Obra Gruesa',
      cantidad: qty,
      unidad: unidadMat.trim() || 'unidades',
      precio_unitario: parsedPrice,
      subtotal: Math.round(qty * parsedPrice),
      proveedor: proveedorMat.trim() || undefined,
      actividad_id: actividadMat || null,
      comprado: false,
    });

    setIsMaterialModalOpen(false);
    setNombreMat('');
    setActividadMat('');
    setCantidadMat('1');
    setPrecioUnitMat('');
    loadData();
    try {
      await dataService.confirmarCambios();
      showToast(`Material "${createdName}" agregado a la lista.`);
    } catch (error) {
      showToast(
        error instanceof Error
          ? error.message
          : `Material "${createdName}" guardado localmente; pendiente de sincronización.`,
      );
    } finally {
      loadData();
    }
  };

  const handleOpenEditMaterial = (m: MaterialProyecto) => {
    setEditingMaterial(m);
    setEditActividadMat(m.actividad_id || '');
    setEditMatNombre(m.nombre);
    setEditMatCategoria(m.categoria || 'Obra Gruesa');
    setEditMatCantidad(String(m.cantidad));
    setEditMatUnidad(m.unidad);
    setEditMatPrecioUnit(formatThousands(m.precio_unitario));
    setEditMatProveedor(m.proveedor || '');
    setEditMatComprado(Boolean(m.comprado));
    setEditMatPagado(m.pagado ?? null);
  };

  const handleSaveEditMaterial = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMaterial || !editMatNombre.trim()) return;

    const parsedPrice = parseThousands(editMatPrecioUnit);
    const qty = Number(editMatCantidad);
    if (!Number.isFinite(qty) || qty <= 0) {
      showToast('Ingresa una cantidad válida mayor a 0.');
      return;
    }

    const received = dataService
      .getBitacora(projectId)
      .filter((b) => b.material_id === editingMaterial.id && b.tipo === 'entrega_material')
      .reduce((s, b) => s + Number(b.cantidad_recibida || 0), 0);
    if (qty < received - 0.000001) {
      showToast(
        `La cantidad no puede ser menor a lo ya recibido en bitácora (${received} ${editMatUnidad || editingMaterial.unidad}).`,
      );
      return;
    }

    const savedName = editMatNombre.trim();
    const isComprado = editMatComprado || editMatPagado === true;
    dataService.updateMaterialProyecto(editingMaterial.id, {
      nombre: savedName,
      categoria: editMatCategoria.trim() || undefined,
      cantidad: qty,
      unidad: editMatUnidad.trim() || editingMaterial.unidad || 'unidades',
      precio_unitario: parsedPrice,
      subtotal: Math.round(qty * parsedPrice),
      proveedor: editMatProveedor.trim() || undefined,
      actividad_id: editActividadMat || null,
      comprado: isComprado,
      pagado: isComprado ? editMatPagado : null,
    });

    setEditingMaterial(null);
    loadData();
    try {
      await dataService.confirmarCambios();
      showToast(`Material "${savedName}" actualizado.`);
    } catch (error) {
      showToast(
        error instanceof Error
          ? error.message
          : `Material "${savedName}" guardado localmente; pendiente de sincronización.`,
      );
    } finally {
      loadData();
    }
  };

  const handleConfirmDeleteMaterial = async () => {
    if (!materialToDelete) return;
    dataService.deleteMaterialProyecto(materialToDelete.id);
    try { await dataService.confirmarCambios(); showToast('Eliminación guardada.'); }
    catch(error) { showToast(error instanceof Error ? error.message : 'Eliminación pendiente de sincronización.'); }
    setMaterialToDelete(null);
    loadData();
  };

  if (isLoading) {
    return <ProjectWorkspaceSkeleton label="Cargando información financiera del proyecto..." />;
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
  const totalPagado = pagos.filter((p) => !p.estado || p.estado === 'completado').reduce((sum, p) => sum + Number(p.monto), 0);
  const totalImprevistos = imprevistos.reduce((sum, i) => sum + Number(i.monto), 0);
  const totalMateriales = materiales.reduce((sum, m) => sum + Number(m.subtotal || (m.cantidad * m.precio_unitario)), 0);
  const totalMaterialesComprados = materiales.filter((m) => m.comprado).reduce((sum, m) => sum + Number(m.subtotal || (m.cantidad * m.precio_unitario)), 0);
  const saldoPendiente = Math.max(0, montoCotizado - totalPagado);
  const porcentajePagado = montoCotizado > 0 ? Math.min(100, Math.round((totalPagado / montoCotizado) * 100)) : 0;

  const totalJornales = imprevistos.filter(row=>row.categoria_gasto==='mano_obra').reduce((sum,row)=>sum+Number(row.monto),0);
  const flujoRegistrado = totalPagado-imprevistos.filter(row=>row.pagado===true).reduce((sum,row)=>sum+Number(row.monto),0)-materiales.filter(row=>row.pagado===true).reduce((sum,row)=>sum+Number(row.subtotal),0);
  const totalCostosDirectos = totalMateriales + totalImprevistos;
  const saldoTrasCostos = montoCotizado - totalCostosDirectos;
  const porcentajeDisponible = montoCotizado > 0 ? Math.round((saldoTrasCostos / montoCotizado) * 100) : 0;

  const chartData = [
    { name: 'Pagado', value: totalPagado, color: '#6B8F72' },
    { name: 'Por Cobrar', value: saldoPendiente, color: '#FF6A00' },
  ];
  if (totalImprevistos > 0) {
    chartData.push({ name: 'Imprevistos', value: totalImprevistos, color: '#D94336' });
  }

  return (
    <div className="flex-1 flex flex-col min-h-screen">
      <ProjectTabsHeader
        proyecto={proyecto}
        cliente={cliente}
        onOpenMaps={() => setIsMapsModalOpen(true)}
      />

      <div className="p-4 sm:p-6 max-w-7xl w-full mx-auto space-y-6">
        
        {/* Barra Ejecutiva: Estado de Pago Formal (EDP PDF) y Cartola Excel (.xlsx) */}
        <div className="bg-white dark:bg-[#141A23] border border-kraft-200 dark:border-[#263040] rounded-2xl p-4 shadow-sm flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-heading font-bold text-sm text-navy-900 dark:text-white">
              Documentos de cobro
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Emite Estados de Pago formales según avance de Carta Gantt o exporta la cartola completa en Excel.
            </p>
          </div>
          <ActionMenu label="Exportaciones de la obra" text="Exportar">
            <button
              type="button"
              onClick={() => setIsEdpModalOpen(true)}
              className="font-medium"
            >
              <FileText className="w-4 h-4" />
              <span>Emitir Estado de Pago (PDF)</span>
            </button>
            <button
              type="button"
              onClick={handleDownloadExecutivePdf}
              className="font-medium"
            >
              <FileText className="w-4 h-4 text-[#FF6A00]" />
              <span>Informe de Avance (PDF)</span>
            </button>
            <button
              type="button"
              disabled={isExportingExcel}
              onClick={() => void handleExportExcel()}
              className="font-medium"
            >
              {isExportingExcel ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <FileSpreadsheet className="w-4 h-4" />
              )}
              <span>{isExportingExcel ? 'Generando Excel…' : 'Exportar Excel'}</span>
            </button>
          </ActionMenu>
        </div>

        <nav
          aria-label="Secciones de finanzas"
          className="bg-white dark:bg-[#141A23] border border-kraft-200 dark:border-[#263040] rounded-2xl p-3 sm:p-3.5 shadow-sm flex items-center gap-1.5 overflow-x-auto max-w-full min-w-0"
        >
          {(
            [
              {
                id: 'resumen',
                label: 'Resumen',
                count: null,
                dot: 'bg-gray-400',
                activeClass:
                  'bg-navy-900 text-white border-navy-900 dark:bg-white dark:text-navy-900 dark:border-white shadow-sm',
              },
              {
                id: 'cobros',
                label: 'Cobros',
                count: pagos.length,
                dot: 'bg-obra-green',
                activeClass: 'bg-obra-green text-white border-obra-green shadow-sm',
              },
              {
                id: 'materiales',
                label: 'Materiales',
                count: materiales.length,
                dot: 'bg-blue-500',
                activeClass: 'bg-blue-600 text-white border-blue-600 shadow-sm',
              },
              {
                id: 'imprevistos',
                label: 'Gastos',
                count: imprevistos.length,
                dot: 'bg-red-500',
                activeClass: 'bg-red-600 text-white border-red-600 shadow-sm',
              },
            ] as const
          ).map((sec) => {
            const isActive = financeSection === sec.id;
            return (
              <button
                type="button"
                key={sec.id}
                onClick={() => setFinanceSection(sec.id)}
                aria-pressed={isActive}
                className={`h-8 px-3 rounded-xl text-xs font-heading font-semibold inline-flex items-center gap-1.5 shrink-0 whitespace-nowrap border transition-all ${
                  isActive
                    ? sec.activeClass
                    : 'bg-kraft-50 dark:bg-[#0F141C] text-gray-600 dark:text-gray-300 border-kraft-200 dark:border-[#263040] hover:bg-kraft-100 dark:hover:bg-[#1E2530]'
                }`}
              >
                {sec.id !== 'resumen' && (
                  <span
                    className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                      isActive ? 'bg-white dark:bg-current' : sec.dot
                    }`}
                  />
                )}
                <span>{sec.label}</span>
                {sec.count !== null && (
                  <span
                    className={`px-1.5 py-0.5 rounded-md text-[10px] font-mono font-bold ${
                      isActive
                        ? 'bg-white/20 text-current'
                        : 'bg-kraft-200/70 dark:bg-gray-800 text-gray-700 dark:text-gray-300'
                    }`}
                  >
                    {sec.count}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
        {/* KPI Cards & Semáforo de Rentabilidad Real */}
        <CompactSummary><div className="workspace-metrics grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <div className="bg-white dark:bg-[#141A23] border border-kraft-200 dark:border-[#263040] rounded-2xl p-4 sm:p-5 shadow-sm flex flex-col justify-between">
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <p className="text-xs font-mono font-semibold uppercase text-gray-500 dark:text-gray-400 tracking-wider">Monto Cotizado (Total)</p>
              <div className="w-8 h-8 rounded-lg bg-navy-800 text-obra-orange flex items-center justify-center shrink-0">
                <FileText className="w-4 h-4" />
              </div>
            </div>
            <div className="text-xl sm:text-2xl font-bold font-mono text-navy-900 dark:text-white">
              <MaskedMoneyAmount value={montoCotizado} label="Monto cotizado total" />
            </div>
            <p className="text-[11px] text-gray-500 dark:text-gray-400 font-sans mt-1">Presupuesto acordado</p>
          </div>

          <div className="bg-white dark:bg-[#141A23] border border-kraft-200 dark:border-[#263040] rounded-2xl p-4 sm:p-5 shadow-sm flex flex-col justify-between">
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <p className="text-xs font-mono font-semibold uppercase text-gray-500 dark:text-gray-400 tracking-wider">Total Recaudado</p>
              <div className="w-8 h-8 rounded-lg bg-obra-green-light dark:bg-obra-green/15 text-[#6B8F72] flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-4 h-4" />
              </div>
            </div>
            <div className="text-xl sm:text-2xl font-bold font-mono text-[#6B8F72]">
              <MaskedMoneyAmount value={totalPagado} label="Total recaudado" />
            </div>
            <p className="text-[11px] text-gray-500 dark:text-gray-400 font-sans mt-1">{porcentajePagado}% del total presupuestado</p>
          </div>

          <div className="bg-white dark:bg-[#141A23] border border-kraft-200 dark:border-[#263040] rounded-2xl p-4 sm:p-5 shadow-sm flex flex-col justify-between">
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <p className="text-xs font-mono font-semibold uppercase text-gray-500 dark:text-gray-400 tracking-wider">Saldo Por Cobrar</p>
              <div className="w-8 h-8 rounded-lg bg-obra-orange-light dark:bg-obra-orange/15 text-[#FF6A00] flex items-center justify-center shrink-0">
                <DollarSign className="w-4 h-4" />
              </div>
            </div>
            <div className="text-xl sm:text-2xl font-bold font-mono text-[#FF6A00]">
              <MaskedMoneyAmount value={saldoPendiente} label="Saldo por cobrar" />
            </div>
            <p className="text-[11px] text-gray-500 dark:text-gray-400 font-sans mt-1">Estados de pago pendientes</p>
          </div>

          <div className="bg-white dark:bg-[#141A23] border border-kraft-200 dark:border-[#263040] rounded-2xl p-4 sm:p-5 shadow-sm flex flex-col justify-between">
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <p className="text-xs font-mono font-semibold uppercase text-gray-500 dark:text-gray-400 tracking-wider">Costos considerados</p>
              <div className="w-8 h-8 rounded-lg bg-blue-500/15 text-blue-500 flex items-center justify-center shrink-0">
                <Package className="w-4 h-4" />
              </div>
            </div>
            <div className="text-xl sm:text-2xl font-bold font-mono text-navy-900 dark:text-gray-200">
              <MaskedMoneyAmount value={totalCostosDirectos} label="Costos considerados" />
            </div>
            <p className="text-[11px] text-gray-500 dark:text-gray-400 font-sans mt-1">Materiales e imprevistos</p>
          </div>

          {/* Tarjeta de Saldo presupuestado y Semáforo */}
          <div className={`rounded-2xl p-4 sm:p-5 shadow-sm border flex flex-col justify-between ${
            porcentajeDisponible >= 25
              ? 'bg-[#6B8F72]/10 border-[#6B8F72]/40 text-navy-900 dark:text-white'
              : porcentajeDisponible >= 10
              ? 'bg-amber-500/10 border-amber-500/40 text-navy-900 dark:text-white'
              : 'bg-red-500/10 border-red-500/40 text-navy-900 dark:text-white'
          }`}>
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <p className="text-xs font-mono font-semibold uppercase text-gray-500 dark:text-gray-400 tracking-wider">Saldo del presupuesto</p>
              <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-lg shrink-0 ${
                porcentajeDisponible >= 25
                  ? 'bg-[#6B8F72] text-white'
                  : porcentajeDisponible >= 10
                  ? 'bg-amber-500 text-white'
                  : 'bg-red-500 text-white'
              }`}>
                {porcentajeDisponible}%
              </span>
            </div>
            <div className={`text-xl sm:text-2xl font-bold font-mono ${
              porcentajeDisponible >= 25
                ? 'text-[#6B8F72]'
                : porcentajeDisponible >= 10
                ? 'text-amber-500'
                : 'text-red-500'
            }`}>
              <MaskedMoneyAmount value={saldoTrasCostos} label="Saldo del presupuesto" />
            </div>
            <p className="text-[11px] text-gray-500 dark:text-gray-400 font-sans mt-1">
              Materiales previstos y gastos registrados. Registra los gastos de mano de obra.
            </p>
          </div>
        </div></CompactSummary>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="min-w-0 rounded-2xl border border-kraft-200 dark:border-[#263040] bg-white dark:bg-[#141A23] p-4 sm:p-5 shadow-sm flex flex-col justify-between">
            <div className="flex items-center justify-between gap-2 mb-1">
              <p className="text-xs font-mono font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                Mano de obra registrada
              </p>
              <div className="w-7 h-7 rounded-lg bg-[#FF6A00]/10 text-[#FF6A00] flex items-center justify-center shrink-0">
                <Clock className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-1 text-xl font-bold font-mono text-navy-900 dark:text-white">
              <MaskedMoneyAmount value={totalJornales} label="Mano de obra registrada" />
            </div>
            <p className="mt-1.5 text-[11px] text-gray-500 dark:text-gray-400">
              Jornales y tratos asociados a la cuadrilla en esta obra.
            </p>
          </div>
          <div className="min-w-0 rounded-2xl border border-kraft-200 dark:border-[#263040] bg-white dark:bg-[#141A23] p-4 sm:p-5 shadow-sm flex flex-col justify-between space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-mono font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                Flujo registrado y consumo
              </p>
              <span className="text-[11px] font-mono font-bold text-[#FF6A00]">
                {montoCotizado > 0 ? Math.min(999, Math.round((totalCostosDirectos / montoCotizado) * 100)) : 0}% costos/contrato
              </span>
            </div>
            <div className="text-xl font-bold font-mono text-navy-900 dark:text-white">
              <MaskedMoneyAmount value={flujoRegistrado} label="Flujo registrado de la obra" />
            </div>
            <div className="h-1.5 w-full rounded-full bg-kraft-100 dark:bg-gray-800 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  montoCotizado > 0 && totalCostosDirectos / montoCotizado >= 1
                    ? 'bg-[#D94336]'
                    : montoCotizado > 0 && totalCostosDirectos / montoCotizado >= 0.85
                      ? 'bg-amber-500'
                      : 'bg-[#6B8F72]'
                }`}
                style={{
                  width: `${montoCotizado > 0 ? Math.min(100, Math.round((totalCostosDirectos / montoCotizado) * 100)) : 0}%`,
                }}
              />
            </div>
            <p className="text-[11px] text-gray-500 dark:text-gray-400">
              Cobros menos pagos confirmados de gastos y materiales. No equivale al saldo bancario.
            </p>
          </div>
        </div>

        {/* Gráfico y Paneles de Control */}
        <div className={financeSection === 'materiales' ? 'hidden' : 'grid grid-cols-1 gap-6'}>
          
          {/* Resumen Analítico: Donut + Flujo Mensual */}
          <div className={`${financeSection === 'resumen' ? 'grid grid-cols-1 lg:grid-cols-2 gap-6' : 'hidden'}`}>
            <div className="bg-white dark:bg-[#141A23] border border-kraft-200 dark:border-[#263040] rounded-2xl p-5 shadow-sm flex flex-col justify-between items-center text-center">
              <div className="w-full flex items-center justify-between gap-2">
                <h4 className="font-heading font-bold text-sm text-navy-900 dark:text-white">Distribución de Flujo</h4>
                <button
                  type="button"
                  onClick={() => setFlowChartRevealed((prev) => !prev)}
                  aria-label={flowChartRevealed ? 'Ocultar montos de Distribución de Flujo' : 'Mostrar montos de Distribución de Flujo'}
                  aria-pressed={flowChartRevealed}
                  title={flowChartRevealed ? 'Ocultar montos' : 'Mostrar montos'}
                  className="inline-flex items-center justify-center p-1.5 rounded-lg border border-kraft-200 dark:border-[#263040] bg-kraft-50/80 dark:bg-[#1E2633] text-gray-500 hover:text-[#FF6A00] transition-colors shrink-0"
                >
                  {flowChartRevealed ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              
              <div className="w-full h-52 my-2">
                {montoCotizado === 0 && totalPagado === 0 ? (
                  <div className="h-full flex items-center justify-center text-xs text-gray-400 font-mono">
                    Sin montos registrados
                  </div>
                ) : (
                  <ProjectFinanzasPieChart chartData={chartData} revealed={flowChartRevealed} />
                )}
              </div>
              
              {/* Leyenda */}
              <div className="w-full space-y-1 text-xs font-mono pt-2 border-t border-kraft-200 dark:border-[#263040]">
                <div className="flex justify-between items-center text-obra-green">
                  <span>● Cobrado:</span>
                  <span>{flowChartRevealed ? formatCLP(totalPagado) : MASKED_CLP_AMOUNT}</span>
                </div>
                <div className="flex justify-between items-center text-obra-orange">
                  <span>● Por Cobrar:</span>
                  <span>{flowChartRevealed ? formatCLP(saldoPendiente) : MASKED_CLP_AMOUNT}</span>
                </div>
                {totalImprevistos > 0 && (
                  <div className="flex justify-between items-center text-obra-red">
                    <span>● Imprevistos:</span>
                    <span>{flowChartRevealed ? formatCLP(totalImprevistos) : MASKED_CLP_AMOUNT}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="bg-white dark:bg-[#141A23] border border-kraft-200 dark:border-[#263040] rounded-2xl p-5 shadow-sm flex flex-col justify-between space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h4 className="font-heading font-bold text-sm text-navy-900 dark:text-white">
                    Flujo Mensual: Cobros vs Costos
                  </h4>
                  <p className="text-[11px] text-gray-500 dark:text-gray-400 font-mono">
                    Evolución mensual de ingresos y costos directos
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setFlowChartRevealed((prev) => !prev)}
                  aria-label={flowChartRevealed ? 'Ocultar montos de Flujo Mensual' : 'Mostrar montos de Flujo Mensual'}
                  className="inline-flex items-center justify-center p-1.5 rounded-lg border border-kraft-200 dark:border-[#263040] bg-kraft-50/80 dark:bg-[#1E2633] text-gray-500 hover:text-[#FF6A00] transition-colors shrink-0"
                >
                  {flowChartRevealed ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <ProjectCashflowChart
                pagos={pagos}
                materiales={materiales}
                imprevistos={imprevistos}
                revealed={flowChartRevealed}
              />
              <div className="flex flex-wrap items-center justify-center gap-5 pt-2 border-t border-kraft-200 dark:border-[#263040] text-xs font-mono">
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#6B8F72]" />
                  <span>Cobros</span>
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#FF6A00]" />
                  <span>Costos y Gastos</span>
                </span>
              </div>
            </div>
          </div>

          {/* Historial Cronológico de Pagos (con CRUD) */}
          <div className={`${financeSection === 'cobros' ? 'flex' : 'hidden'} bg-white border border-kraft-200 rounded-xl p-5 shadow-sm flex-col justify-between`}>
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

              <div className="max-h-72 overflow-y-auto overflow-x-auto pr-1">
                {pagos.length === 0 ? (
                  <div className="py-8 text-center space-y-2.5">
                    <div className="w-10 h-10 rounded-xl bg-obra-green-light dark:bg-obra-green/15 text-obra-green flex items-center justify-center mx-auto">
                      <CreditCard className="w-5 h-5" />
                    </div>
                    <p className="text-xs font-heading font-bold text-navy-900 dark:text-white">No se han registrado pagos</p>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400 max-w-xs mx-auto">
                      Registra anticipos o estados de pago del cliente para actualizar el flujo recaudado de la obra.
                    </p>
                  </div>
                ) : (
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-kraft-200 dark:border-[#263040] text-gray-500 dark:text-gray-400 font-mono uppercase text-[11px]">
                        <th className="py-2 pr-3 font-medium">Fecha</th>
                        <th className="py-2 pr-3 font-medium">Detalle</th>
                        <th className="py-2 pr-3 font-medium text-right">Monto</th>
                        <th className="py-2 text-right font-medium">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-kraft-200/70 dark:divide-[#263040]">
                      {pagos.map((pago) => (
                        <tr key={pago.id} className="hover:bg-kraft-50/50 dark:hover:bg-[#1A222D]/40 transition-colors">
                          <td className="py-2.5 pr-3 whitespace-nowrap text-gray-600 dark:text-gray-300">
                            {formatDate(pago.fecha)}
                          </td>
                          <td className="py-2.5 pr-3 text-gray-700 dark:text-gray-300 max-w-[220px] truncate">
                            <span className="capitalize font-medium text-navy-900 dark:text-white">{pago.metodo}</span>
                            {pago.nota ? <span className="text-gray-500 dark:text-gray-400"> · {pago.nota}</span> : null}
                          </td>
                          <td className="py-2.5 pr-3 whitespace-nowrap text-right font-mono font-semibold text-navy-900 dark:text-white">
                            <MaskedMoneyAmount value={pago.monto} label={`Monto de pago del ${formatDate(pago.fecha)}`} compact />
                          </td>
                          <td className="py-2.5 text-right whitespace-nowrap">
                            <div className="inline-flex items-center justify-end gap-1">
                              <button
                                type="button"
                                onClick={() => handleOpenEditPago(pago)}
                                className="p-1 text-gray-400 hover:text-obra-orange rounded transition-colors"
                                title="Editar pago"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setPagoToDelete(pago)}
                                className="p-1 text-gray-400 hover:text-red-600 rounded transition-colors"
                                title="Eliminar pago"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>

          {/* Historial de Imprevistos con Fotos (con CRUD) */}
          <div className={`${financeSection === 'imprevistos' ? 'flex' : 'hidden'} bg-white dark:bg-[#141A23] border border-kraft-200 dark:border-[#263040] rounded-2xl p-5 shadow-sm flex-col justify-between`}>
            <div>
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <h4 className="font-heading font-bold text-sm text-navy-900 dark:text-white flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-obra-red" />
                  <span>Gastos registrados</span>
                </h4>
                <button
                  onClick={() => setIsImprevistoModalOpen(true)}
                  className="px-2.5 py-1 bg-obra-red hover:bg-red-700 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors"
                >
                  + Registrar gasto
                </button>
              </div>

              {imprevistos.length > 0 && (
                <div className="flex flex-wrap items-center justify-between gap-2 mb-3 pb-2.5 border-b border-kraft-100 dark:border-[#263040]">
                  <div className="flex flex-wrap gap-1.5">
                    {(
                      [
                        { id: 'todos', label: 'Todos' },
                        { id: 'mano_obra', label: 'Mano de obra' },
                        { id: 'imprevisto', label: 'Imprevisto' },
                        { id: 'gasto_general', label: 'Gasto general' },
                      ] as const
                    ).map((cat) => (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => setExpenseCatFilter(cat.id)}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors ${
                          expenseCatFilter === cat.id
                            ? 'bg-[#FF6A00] text-white'
                            : 'bg-kraft-50 dark:bg-[#0F141C] text-gray-600 dark:text-gray-300 border border-kraft-200 dark:border-[#263040]'
                        }`}
                      >
                        {cat.label}
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-1.5">
                    {(
                      [
                        { id: 'todos', label: 'Todos' },
                        { id: 'pendiente', label: 'Pendientes' },
                        { id: 'pagado', label: 'Pagados' },
                      ] as const
                    ).map((st) => (
                      <button
                        key={st.id}
                        type="button"
                        onClick={() => setExpensePaidFilter(st.id)}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors ${
                          expensePaidFilter === st.id
                            ? 'bg-navy-900 dark:bg-white text-white dark:text-navy-900'
                            : 'bg-kraft-50 dark:bg-[#0F141C] text-gray-600 dark:text-gray-300 border border-kraft-200 dark:border-[#263040]'
                        }`}
                      >
                        {st.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="max-h-80 overflow-y-auto overflow-x-auto pr-1">
                {(() => {
                  const visibleExpenses = imprevistos.filter((imp) => {
                    const cat = imp.categoria_gasto || 'imprevisto';
                    if (expenseCatFilter !== 'todos' && cat !== expenseCatFilter) return false;
                    if (expensePaidFilter === 'pagado' && imp.pagado !== true) return false;
                    if (expensePaidFilter === 'pendiente' && imp.pagado === true) return false;
                    return true;
                  });

                  if (visibleExpenses.length === 0) {
                    return (
                      <div className="py-8 text-center space-y-2.5">
                        <div className="w-10 h-10 rounded-xl bg-obra-red-light dark:bg-obra-red/15 text-obra-red flex items-center justify-center mx-auto">
                          <AlertTriangle className="w-5 h-5" />
                        </div>
                        <p className="text-xs font-heading font-bold text-navy-900 dark:text-white">
                          {imprevistos.length === 0
                            ? 'Sin imprevistos registrados'
                            : 'No hay gastos con este filtro'}
                        </p>
                        <p className="text-[11px] text-gray-500 dark:text-gray-400 max-w-xs mx-auto">
                          Reporta gastos extraordinarios o emergencias de terreno para controlar el margen real de la obra.
                        </p>
                      </div>
                    );
                  }

                  return (
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-kraft-200 dark:border-[#263040] text-gray-500 dark:text-gray-400 font-mono uppercase text-[11px]">
                          <th className="py-2 pr-3 font-medium">Fecha</th>
                          <th className="py-2 pr-3 font-medium">Descripción</th>
                          <th className="py-2 pr-3 font-medium">Categoría</th>
                          <th className="py-2 pr-3 font-medium text-right">Monto</th>
                          <th className="py-2 pr-3 font-medium">Estado</th>
                          <th className="py-2 text-right font-medium">Acciones</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-kraft-200/70 dark:divide-[#263040]">
                        {visibleExpenses.map((imp) => (
                          <tr key={imp.id} className="hover:bg-kraft-50/50 dark:hover:bg-[#1A222D]/40 transition-colors">
                            <td className="py-2.5 pr-3 whitespace-nowrap text-gray-600 dark:text-gray-300">
                              {formatDate(imp.fecha)}
                            </td>
                            <td className="py-2.5 pr-3 text-navy-900 dark:text-white font-medium max-w-[200px] truncate" title={imp.descripcion}>
                              {imp.descripcion}
                            </td>
                            <td className="py-2.5 pr-3 whitespace-nowrap text-gray-500 dark:text-gray-400">
                              {imp.categoria_gasto === 'mano_obra' ? 'Mano de obra' : imp.categoria_gasto === 'gasto_general' ? 'Gasto general' : 'Imprevisto'}
                              {imp.origen === 'whatsapp_ia' ? ' · IA' : ''}
                            </td>
                            <td className="py-2.5 pr-3 whitespace-nowrap text-right font-mono font-semibold text-obra-red">
                              <MaskedMoneyAmount value={imp.monto} label={`Monto de ${imp.descripcion}`} compact />
                            </td>
                            <td className="py-2.5 pr-3 whitespace-nowrap">
                              <span
                                className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                                  imp.pagado === true
                                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300'
                                    : imp.pagado === false
                                      ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300'
                                      : 'bg-gray-100 text-gray-600 dark:bg-[#1E2530] dark:text-gray-300'
                                }`}
                              >
                                {imp.pagado === true ? 'Pagado' : imp.pagado === false ? 'Pendiente' : 'Sin confirmar'}
                              </span>
                            </td>
                            <td className="py-2.5 text-right whitespace-nowrap">
                              <div className="inline-flex items-center justify-end gap-1">
                                {imp.pagado !== true && (
                                  <button
                                    type="button"
                                    onClick={() => void handleMarkExpensePaid(imp)}
                                    className="px-2 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60 text-[11px] font-semibold hover:bg-emerald-100 dark:hover:bg-emerald-900/50 transition-colors"
                                    title="Marcar gasto como pagado"
                                  >
                                    Marcar pagado
                                  </button>
                                )}
                                {imp.foto_url && (
                                  <button
                                    type="button"
                                    onClick={() => setPreviewPhoto(imp.foto_url || null)}
                                    className="w-6 h-6 rounded border border-kraft-200 overflow-hidden"
                                    title="Ver foto de respaldo"
                                  >
                                    <img
                                      src={imp.foto_url}
                                      alt="Evidencia"
                                      loading="lazy"
                                      decoding="async"
                                      className="w-full h-full object-cover"
                                    />
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => handleOpenEditImprevisto(imp)}
                                  className="p-1 text-gray-400 hover:text-obra-orange rounded transition-colors"
                                  title="Editar imprevisto"
                                >
                                  <Edit3 className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setImprevistoToDelete(imp)}
                                  className="p-1 text-gray-400 hover:text-red-600 rounded transition-colors"
                                  title="Eliminar imprevisto"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  );
                })()}
              </div>
            </div>
          </div>

        </div>

        {/* Sección: Materiales & Insumos de la Obra (con CRUD) */}
        <div className={`${financeSection === 'materiales' ? '' : 'hidden'} bg-white dark:bg-[#141A23] border border-kraft-200 dark:border-[#263040] rounded-2xl p-4 sm:p-6 shadow-sm space-y-4`}>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-kraft-200 dark:border-[#263040]">
            <div>
              <h3 className="font-heading font-black text-lg text-navy-900 dark:text-white flex items-center gap-2">
                <Package className="w-5 h-5 text-obra-orange" />
                <span>Materiales</span>
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 font-sans mt-0.5">
                Compras, pagos y recepciones en obra.
              </p>
            </div>
            
            <button
              onClick={() => setIsMaterialModalOpen(true)}
              className="px-4 py-2 bg-obra-orange hover:bg-obra-orange-hover text-white text-xs font-bold rounded-xl shadow-sm flex items-center gap-1.5 font-heading self-start sm:self-auto"
            >
              <Plus className="w-4 h-4" />
              <span>Agregar Material</span>
            </button>
          </div>

          {materiales.length === 0 ? (
            <div className="py-8 text-center text-gray-500 dark:text-gray-400 font-sans space-y-2">
              <ShoppingBag className="w-8 h-8 text-gray-300 dark:text-gray-600 mx-auto" />
              <p className="text-xs">No has agregado materiales a esta obra aún.</p>
              <button
                onClick={() => setIsMaterialModalOpen(true)}
                className="text-xs font-bold text-obra-orange hover:underline"
              >
                + Agregar el primer material
              </button>
            </div>
          ) : (
            <ProjectMaterials
              projectId={projectId}
              materials={materiales}
              activities={actividades}
              onEdit={handleOpenEditMaterial}
              onDelete={setMaterialToDelete}
              onChanged={loadData}
              onNotify={showToast}
            />
          )}
        </div>

      </div>

      {/* Modal: Registrar Pago Manual */}
      {isPaymentModalOpen && (
        <ModalOverlay className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
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
        </ModalOverlay>
      )}

      {/* Modal: Editar Pago */}
      {editingPago && (
        <ModalOverlay className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
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
        </ModalOverlay>
      )}

      {/* Modal: Confirmar Eliminar Pago */}
      {pagoToDelete && (
        <ModalOverlay className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
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
        </ModalOverlay>
      )}

      {/* Modal: Registrar Imprevisto Manual */}
      {isImprevistoModalOpen && (
        <ModalOverlay className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative w-full max-w-md my-auto bg-white dark:bg-[#141A23] border border-[#E5DFC9] dark:border-[#263040] rounded-2xl sm:rounded-3xl max-h-[calc(100dvh-2rem)] overflow-y-auto p-5 sm:p-6 shadow-2xl animate-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-kraft-200">
              <h3 className="font-heading font-bold text-base text-navy-900 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-obra-red" />
                <span>Registrar gasto de la obra</span>
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

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div>
                  <label htmlFor="nuevo-gasto-categoria" className="block text-xs font-mono font-semibold text-gray-700 uppercase mb-1">
                    Categoría
                  </label>
                  <select
                    id="nuevo-gasto-categoria"
                    value={costCategory || 'imprevisto'}
                    onChange={(e) => setCostCategory(e.target.value as Imprevisto['categoria_gasto'])}
                    className="w-full px-2.5 py-1.5 bg-kraft-50 border border-kraft-200 rounded-xl text-xs"
                  >
                    <option value="imprevisto">Imprevisto</option>
                    <option value="mano_obra">Mano de obra</option>
                    <option value="gasto_general">Gasto general</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="nuevo-gasto-trabajador" className="block text-xs font-mono font-semibold text-gray-700 uppercase mb-1">
                    Trabajador
                  </label>
                  <select
                    id="nuevo-gasto-trabajador"
                    value={costWorker}
                    onChange={(e) => setCostWorker(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-kraft-50 border border-kraft-200 rounded-xl text-xs"
                  >
                    <option value="">Sin asignar</option>
                    {(proyecto?.trabajadores?.length ? proyecto.trabajadores : dataService.getUsuarios()).map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.nombre}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="nuevo-gasto-pagado" className="block text-xs font-mono font-semibold text-gray-700 uppercase mb-1">
                    Estado pago
                  </label>
                  <select
                    id="nuevo-gasto-pagado"
                    value={costPaid === true ? 'true' : costPaid === false ? 'false' : ''}
                    onChange={(e) =>
                      setCostPaid(e.target.value === 'true' ? true : e.target.value === 'false' ? false : null)
                    }
                    className="w-full px-2.5 py-1.5 bg-kraft-50 border border-kraft-200 rounded-xl text-xs"
                  >
                    <option value="">Por confirmar</option>
                    <option value="true">Pagado</option>
                    <option value="false">Pendiente de pago</option>
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-mono font-semibold text-gray-700 uppercase mb-1">
                  Fotografía Respaldo (Opcional)
                </label>
                <div className="flex items-center gap-2">
                  <label className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-2 bg-kraft-100 hover:bg-kraft-200 text-navy-900 rounded-xl text-xs font-semibold transition-colors shrink-0">
                    <ImageIcon className="w-3.5 h-3.5 text-obra-red" />
                    <span>{isUploadingPhoto ? 'Subiendo…' : 'Subir foto / Boleta'}</span>
                    <input
                      type="file"
                      accept="image/*"
                      disabled={isUploadingPhoto}
                      onChange={(e) => void handleUploadImprevistoPhoto(e.target.files?.[0], setFotoUrlImprevisto)}
                      className="hidden"
                    />
                  </label>
                  <input
                    type="url"
                    placeholder="o pega URL https://..."
                    value={fotoUrlImprevisto}
                    onChange={(e) => setFotoUrlImprevisto(e.target.value)}
                    className="w-full px-3 py-2 bg-kraft-50 border border-kraft-200 rounded-xl text-xs"
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
                  Guardar gasto
                </button>
              </div>
            </form>
          </div>
        </ModalOverlay>
      )}

      {/* Modal: Editar Imprevisto */}
      {editingImprevisto && (
        <ModalOverlay className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
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

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div>
                  <label htmlFor="editar-gasto-categoria" className="block text-xs font-mono font-semibold text-gray-700 uppercase mb-1">
                    Categoría
                  </label>
                  <select
                    id="editar-gasto-categoria"
                    value={editCostCategory || 'imprevisto'}
                    onChange={(e) => setEditCostCategory(e.target.value as Imprevisto['categoria_gasto'])}
                    className="w-full px-2.5 py-1.5 bg-kraft-50 border border-kraft-200 rounded-xl text-xs"
                  >
                    <option value="imprevisto">Imprevisto</option>
                    <option value="mano_obra">Mano de obra</option>
                    <option value="gasto_general">Gasto general</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="editar-gasto-trabajador" className="block text-xs font-mono font-semibold text-gray-700 uppercase mb-1">
                    Trabajador
                  </label>
                  <select
                    id="editar-gasto-trabajador"
                    value={editCostWorker}
                    onChange={(e) => setEditCostWorker(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-kraft-50 border border-kraft-200 rounded-xl text-xs"
                  >
                    <option value="">Sin asignar</option>
                    {(proyecto?.trabajadores?.length ? proyecto.trabajadores : dataService.getUsuarios()).map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.nombre}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="editar-gasto-pagado" className="block text-xs font-mono font-semibold text-gray-700 uppercase mb-1">
                    Estado pago
                  </label>
                  <select
                    id="editar-gasto-pagado"
                    value={editCostPaid === true ? 'true' : editCostPaid === false ? 'false' : ''}
                    onChange={(e) =>
                      setEditCostPaid(e.target.value === 'true' ? true : e.target.value === 'false' ? false : null)
                    }
                    className="w-full px-2.5 py-1.5 bg-kraft-50 border border-kraft-200 rounded-xl text-xs"
                  >
                    <option value="">Por confirmar</option>
                    <option value="true">Pagado</option>
                    <option value="false">Pendiente de pago</option>
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-mono font-semibold text-gray-700 uppercase mb-1">
                  Fotografía Respaldo
                </label>
                <div className="flex items-center gap-2">
                  <label className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-2 bg-kraft-100 hover:bg-kraft-200 text-navy-900 rounded-xl text-xs font-semibold transition-colors shrink-0">
                    <ImageIcon className="w-3.5 h-3.5 text-obra-red" />
                    <span>{isUploadingPhoto ? 'Subiendo…' : 'Subir foto / Boleta'}</span>
                    <input
                      type="file"
                      accept="image/*"
                      disabled={isUploadingPhoto}
                      onChange={(e) => void handleUploadImprevistoPhoto(e.target.files?.[0], setEditImpFoto)}
                      className="hidden"
                    />
                  </label>
                  <input
                    type="url"
                    value={editImpFoto}
                    onChange={(e) => setEditImpFoto(e.target.value)}
                    className="w-full px-3 py-2 bg-kraft-50 border border-kraft-200 rounded-xl text-xs"
                  />
                </div>
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
        </ModalOverlay>
      )}

      {/* Modal: Confirmar Eliminar Imprevisto */}
      {imprevistoToDelete && (
        <ModalOverlay className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
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
        </ModalOverlay>
      )}

      <datalist id="material-providers-list">
        <option value="Easy" />
        <option value="Dimaco" />
        <option value="Imperial" />
        <option value="Construmart" />
        <option value="Sodimac Constructor" />
        <option value="Red MTS" />
        <option value="Barraca Local" />
      </datalist>
      <datalist id="material-units-list">
        <option value="sacos" />
        <option value="placas" />
        <option value="tiras" />
        <option value="barras" />
        <option value="m2" />
        <option value="m3" />
        <option value="kg" />
        <option value="unidades" />
        <option value="global" />
      </datalist>
      <datalist id="material-categories-list">
        {Object.values(MATERIAL_CATEGORY_LABELS).map((label) => (
          <option key={label} value={label} />
        ))}
      </datalist>

      {/* Modal: + Agregar Material a la Obra */}
      {isMaterialModalOpen && (
        <ModalOverlay className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
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
                <MaterialCatalogQuickSearch
                  query={nombreMat}
                  cantidad={Number(cantidadMat)}
                  unidad={unidadMat}
                  onSelect={(sel) => {
                    setNombreMat(sel.nombre);
                    setPrecioUnitMat(formatThousands(sel.precioUnitario));
                    setProveedorMat(sel.proveedor);
                    if (sel.categoria) setCategoriaMat(sel.categoria);
                  }}
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-mono font-semibold text-gray-700 uppercase mb-1">
                    Cantidad *
                  </label>
                  <input
                    type="number"
                    min="0.001"
                    step="any"
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
                  <label className="block text-xs font-mono font-semibold text-gray-700 dark:text-gray-300 uppercase mb-1">
                    Proveedor Sugerido
                  </label>
                  <input
                    type="text"
                    list="material-providers-list"
                    placeholder="Ej: Imperial, Sodimac, Dimaco"
                    value={proveedorMat}
                    onChange={(e) => setProveedorMat(e.target.value)}
                    className="w-full px-3 py-2 bg-kraft-50 dark:bg-[#0F141C] border border-kraft-200 dark:border-[#2C3748] rounded-xl text-xs font-mono text-gray-900 dark:text-white focus:outline-none focus:border-obra-orange"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300">
                  Partida que requiere el material (opcional)
                  <select
                    value={actividadMat}
                    onChange={(e) => setActividadMat(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-kraft-200 dark:border-[#2C3748] bg-kraft-50 dark:bg-[#0F141C] px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:border-obra-orange"
                  >
                    <option value="">Sin partida asociada</option>
                    {actividades.map((row) => (
                      <option key={row.id} value={row.id}>
                        {row.nombre}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-kraft-200 dark:border-[#263040]">
                <button
                  type="button"
                  onClick={() => setIsMaterialModalOpen(false)}
                  className="px-3 py-1.5 text-xs text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
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
        </ModalOverlay>
      )}

      {/* Modal: Editar Material */}
      {editingMaterial && (
        <ModalOverlay className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative w-full max-w-md my-auto bg-white dark:bg-[#141A23] border border-[#E5DFC9] dark:border-[#263040] rounded-2xl max-h-[calc(100dvh-2rem)] overflow-y-auto p-4 sm:p-5 shadow-2xl animate-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 mb-3.5 border-b border-kraft-200 dark:border-[#263040]">
              <h3 className="font-heading font-bold text-sm sm:text-base text-navy-900 dark:text-white flex items-center gap-2">
                <Edit3 className="w-4 h-4 text-obra-orange" />
                <span>Editar material</span>
              </h3>
              <button
                type="button"
                onClick={() => setEditingMaterial(null)}
                aria-label="Cerrar"
                className="p-1 rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-[#1E2633]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveEditMaterial} className="space-y-3.5">
              <div>
                <label
                  htmlFor="edit-mat-nombre"
                  className="block text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1"
                >
                  Nombre *
                </label>
                <input
                  id="edit-mat-nombre"
                  type="text"
                  required
                  value={editMatNombre}
                  onChange={(e) => setEditMatNombre(e.target.value)}
                  className="w-full px-3 py-2 bg-[#FAF8F5] dark:bg-[#0F141C] border border-kraft-200 dark:border-[#2C3748] rounded-xl text-xs sm:text-sm font-medium text-gray-900 dark:text-white focus:outline-none focus:border-obra-orange"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label
                    htmlFor="edit-mat-categoria"
                    className="block text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1"
                  >
                    Categoría
                  </label>
                  <input
                    id="edit-mat-categoria"
                    type="text"
                    list="material-categories-list"
                    placeholder="Obra gruesa"
                    value={editMatCategoria}
                    onChange={(e) => setEditMatCategoria(e.target.value)}
                    className="w-full px-3 py-2 bg-[#FAF8F5] dark:bg-[#0F141C] border border-kraft-200 dark:border-[#2C3748] rounded-xl text-xs text-gray-900 dark:text-white focus:outline-none focus:border-obra-orange"
                  />
                </div>
                <div>
                  <label
                    htmlFor="edit-mat-proveedor"
                    className="block text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1"
                  >
                    Proveedor
                  </label>
                  <input
                    id="edit-mat-proveedor"
                    type="text"
                    list="material-providers-list"
                    placeholder="Por definir"
                    value={editMatProveedor}
                    onChange={(e) => setEditMatProveedor(e.target.value)}
                    className="w-full px-3 py-2 bg-[#FAF8F5] dark:bg-[#0F141C] border border-kraft-200 dark:border-[#2C3748] rounded-xl text-xs text-gray-900 dark:text-white focus:outline-none focus:border-obra-orange"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                <div>
                  <label
                    htmlFor="edit-mat-cantidad"
                    className="block text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1"
                  >
                    Cantidad *
                  </label>
                  <input
                    id="edit-mat-cantidad"
                    type="number"
                    min="0.001"
                    step="any"
                    required
                    value={editMatCantidad}
                    onChange={(e) => setEditMatCantidad(e.target.value)}
                    className="w-full px-3 py-2 bg-[#FAF8F5] dark:bg-[#0F141C] border border-kraft-200 dark:border-[#2C3748] rounded-xl text-xs font-mono text-gray-900 dark:text-white focus:outline-none focus:border-obra-orange"
                  />
                </div>
                <div>
                  <label
                    htmlFor="edit-mat-unidad"
                    className="block text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1"
                  >
                    Unidad *
                  </label>
                  <input
                    id="edit-mat-unidad"
                    type="text"
                    list="material-units-list"
                    required
                    value={editMatUnidad}
                    onChange={(e) => setEditMatUnidad(e.target.value)}
                    className="w-full px-3 py-2 bg-[#FAF8F5] dark:bg-[#0F141C] border border-kraft-200 dark:border-[#2C3748] rounded-xl text-xs font-mono text-gray-900 dark:text-white focus:outline-none focus:border-obra-orange"
                  />
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <label
                    htmlFor="edit-mat-precio"
                    className="block text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1"
                  >
                    Precio c/u *
                  </label>
                  <div className="relative">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 font-mono text-xs">$</span>
                    <input
                      id="edit-mat-precio"
                      type="text"
                      required
                      value={editMatPrecioUnit}
                      onChange={(e) => setEditMatPrecioUnit(formatThousands(e.target.value))}
                      className="w-full pl-6 pr-2.5 py-2 bg-[#FAF8F5] dark:bg-[#0F141C] border border-kraft-200 dark:border-[#2C3748] rounded-xl text-xs font-mono font-semibold text-gray-900 dark:text-white focus:outline-none focus:border-obra-orange"
                    />
                  </div>
                </div>
              </div>

              <div className="rounded-xl bg-[#FAF8F5] dark:bg-[#1A222D] border border-kraft-200/80 dark:border-[#263040] px-3 py-2 flex items-center justify-between text-xs">
                <span className="text-gray-500 dark:text-gray-400">Subtotal calculado</span>
                <strong className="font-bold text-gray-900 dark:text-white tabular-nums">
                  {formatCLP(
                    Math.round(
                      (Number(editMatCantidad) || 0) * parseThousands(editMatPrecioUnit),
                    ),
                  )}
                </strong>
              </div>

              <div>
                <label
                  htmlFor="edit-mat-actividad"
                  className="block text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1"
                >
                  Partida asociada (opcional)
                </label>
                <select
                  id="edit-mat-actividad"
                  value={editActividadMat}
                  onChange={(e) => setEditActividadMat(e.target.value)}
                  className="w-full rounded-xl border border-kraft-200 dark:border-[#2C3748] bg-[#FAF8F5] dark:bg-[#0F141C] px-3 py-2 text-xs text-gray-900 dark:text-white focus:outline-none focus:border-obra-orange"
                >
                  <option value="">Sin partida asociada</option>
                  {actividades.map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.nombre}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-1">
                <label className="inline-flex items-center gap-2 text-xs text-gray-700 dark:text-gray-300 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={editMatComprado}
                    onChange={(e) => {
                      const patch = materialPurchasePaymentPatch(
                        { comprado: editMatComprado, pagado: editMatPagado },
                        'comprado',
                        e.target.checked,
                      );
                      setEditMatComprado(patch.comprado);
                      setEditMatPagado(patch.pagado ?? null);
                    }}
                    className="h-3.5 w-3.5 rounded border-gray-300 dark:border-gray-600 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span>Compra registrada</span>
                </label>
                <label className="inline-flex items-center gap-2 text-xs text-gray-700 dark:text-gray-300 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={editMatPagado === true}
                    onChange={(e) => {
                      const patch = materialPurchasePaymentPatch(
                        { comprado: editMatComprado, pagado: editMatPagado },
                        'pagado',
                        e.target.checked,
                      );
                      setEditMatComprado(patch.comprado);
                      setEditMatPagado(patch.pagado ?? null);
                    }}
                    className="h-3.5 w-3.5 rounded border-gray-300 dark:border-gray-600 text-emerald-600 focus:ring-emerald-500"
                  />
                  <span>Pago confirmado</span>
                </label>
                {editMatPagado === false && (
                  <span className="text-[11px] font-medium text-amber-700 dark:text-amber-300">
                    Por pagar
                  </span>
                )}
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-kraft-200 dark:border-[#263040]">
                <button
                  type="button"
                  onClick={() => setEditingMaterial(null)}
                  className="px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
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
        </ModalOverlay>
      )}

      {/* Modal: Confirmar Eliminar Material */}
      {materialToDelete && (
        <ModalOverlay className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
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
        </ModalOverlay>
      )}

      {/* Modal: Vista previa de Foto */}
      {previewPhoto && (
        <ModalOverlay className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative w-full max-w-xl my-auto bg-white dark:bg-[#141A23] rounded-2xl p-4 overflow-hidden shadow-2xl animate-in zoom-in-95">
            <button
              onClick={() => setPreviewPhoto(null)}
              className="absolute top-3 right-3 p-1 rounded-full bg-black/50 text-white hover:bg-black"
            >
              <X className="w-5 h-5" />
            </button>
            <img src={previewPhoto} alt="Respaldo fotográfico" className="w-full h-auto max-h-[75vh] object-contain rounded-lg" />
          </div>
        </ModalOverlay>
      )}

      {isEdpModalOpen && (
        <EstadoPagoPdfModal
          isOpen={isEdpModalOpen}
          onClose={() => setIsEdpModalOpen(false)}
          proyecto={proyecto}
          cliente={cliente}
          actividades={actividades}
          pagos={pagos}
          cambios={cambios}
          onRegistrarPago={handleRegistrarPagoDesdeEdp}
        />
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
