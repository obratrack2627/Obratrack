'use client';

import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import {
  FolderOpen,
  FileText,
  Upload,
  Plus,
  Search,
  Mail,
  Receipt,
  Map,
  ShieldCheck,
  Paperclip,
  Download,
  Eye,
  Trash2,
  X,
  Sparkles,
  CheckCircle2,
} from 'lucide-react';
import ProjectTabsHeader from '@/components/ProjectTabsHeader';
import GoogleMapsProjectViewer from '@/components/GoogleMapsProjectViewer';
import { dataService } from '@/lib/data-service';
import {
  Proyecto,
  Cliente,
  DocumentoObra,
  CategoriaDocumentoObra,
} from '@/types/database';
import { formatCLP, formatDate } from '@/lib/utils';

export default function ProyectoDocumentosPage() {
  const params = useParams();
  const projectId = params?.id as string;

  const [proyecto, setProyecto] = useState<Proyecto | null>(null);
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [documentos, setDocumentos] = useState<DocumentoObra[]>([]);
  const [categoriaActiva, setCategoriaActiva] = useState<string>('todos');
  const [busqueda, setBusqueda] = useState('');
  const [isMapsModalOpen, setIsMapsModalOpen] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [docPreview, setDocPreview] = useState<DocumentoObra | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Estado formulario nuevo documento / correo
  const [categoria, setCategoria] = useState<CategoriaDocumentoObra>('contrato');
  const [nombre, setNombre] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [fechaDocumento, setFechaDocumento] = useState(new Date().toISOString().split('T')[0]);
  const [numeroDocumento, setNumeroDocumento] = useState('');
  const [proveedorEntidad, setProveedorEntidad] = useState('');
  const [montoDocumento, setMontoDocumento] = useState('');
  const [correoRemitente, setCorreoRemitente] = useState('');
  const [correoDestinatario, setCorreoDestinatario] = useState('');
  const [correoAsunto, setCorreoAsunto] = useState('');
  const [correoCuerpo, setCorreoCuerpo] = useState('');

  const [archivoUrl, setArchivoUrl] = useState('');
  const [archivoNombre, setArchivoNombre] = useState('');
  const [archivoTamano, setArchivoTamano] = useState<number | undefined>(undefined);
  const [mimeType, setMimeType] = useState('');
  const [isUploading, setIsUploading] = useState(false);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  const loadData = () => {
    if (!projectId) return;
    const proj = dataService.getProyectoById(projectId);
    setProyecto(proj || null);
    if (proj?.cliente_id) {
      setCliente(dataService.getClienteById(proj.cliente_id) || null);
    }
    setDocumentos(dataService.getDocumentosObra(projectId));
  };

  useEffect(() => {
    loadData();
    const onSync = () => loadData();
    window.addEventListener('obratrack_cloud_synced', onSync);
    return () => window.removeEventListener('obratrack_cloud_synced', onSync);
  }, [projectId]);

  const handleOpenModal = (cat: CategoriaDocumentoObra = 'contrato') => {
    setCategoria(cat);
    setNombre('');
    setDescripcion('');
    setFechaDocumento(new Date().toISOString().split('T')[0]);
    setNumeroDocumento('');
    setProveedorEntidad('');
    setMontoDocumento('');
    setCorreoRemitente(cliente?.email || '');
    setCorreoDestinatario(dataService.getActiveUser()?.email || 'constructora@obratrack.cl');
    setCorreoAsunto('');
    setCorreoCuerpo('');
    setArchivoUrl('');
    setArchivoNombre('');
    setArchivoTamano(undefined);
    setMimeType('');
    setIsModalOpen(true);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !projectId) return;
    setIsUploading(true);
    try {
      const res = await dataService.uploadArchivoObra(file, projectId, 'documentos-obra');
      setArchivoUrl(res.publicUrl);
      setArchivoNombre(res.fileName);
      setArchivoTamano(res.fileSize);
      setMimeType(res.mimeType);
      if (!nombre.trim()) {
        setNombre(res.fileName.replace(/\.[^/.]+$/, ''));
      }
      showToast('📁 Archivo cargado en Supabase Storage (documentos-obra).');
    } catch (err: any) {
      showToast(err.message || 'Error al subir el documento.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleGuardarDocumento = (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectId) return;
    const tituloFinal =
      nombre.trim() || correoAsunto.trim() || archivoNombre || 'Documento de Obra';

    dataService.createDocumentoObra({
      proyecto_id: projectId,
      categoria,
      nombre: tituloFinal,
      descripcion: descripcion.trim() || undefined,
      archivo_url: archivoUrl || undefined,
      archivo_nombre: archivoNombre || undefined,
      archivo_tamano: archivoTamano,
      mime_type: mimeType || undefined,
      numero_documento: numeroDocumento.trim() || undefined,
      proveedor_entidad: proveedorEntidad.trim() || undefined,
      monto_documento: montoDocumento ? Number(montoDocumento) : undefined,
      correo_remitente: correoRemitente.trim() || undefined,
      correo_destinatario: correoDestinatario.trim() || undefined,
      correo_asunto: correoAsunto.trim() || undefined,
      correo_cuerpo: correoCuerpo.trim() || undefined,
      fecha_documento: fechaDocumento,
    });

    setIsModalOpen(false);
    loadData();
    showToast('✅ Documento archivado en el repositorio de la obra.');
  };

  const handleEliminar = (id: string) => {
    dataService.deleteDocumentoObra(id);
    loadData();
    showToast('Documento eliminado del repositorio.');
  };

  const formatBytes = (bytes?: number) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(2)} MB`;
  };

  const getCategoriaMeta = (cat: CategoriaDocumentoObra) => {
    switch (cat) {
      case 'contrato':
        return {
          label: 'Contrato / Anexo',
          icon: FileText,
          color: 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border-indigo-500/30',
        };
      case 'plano':
        return {
          label: 'Plano / EETT',
          icon: Map,
          color: 'bg-cyan-500/15 text-cyan-600 dark:text-cyan-400 border-cyan-500/30',
        };
      case 'factura_boleta':
        return {
          label: 'Factura / Boleta',
          icon: Receipt,
          color: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
        };
      case 'correo':
        return {
          label: 'Correo Asociado',
          icon: Mail,
          color: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30',
        };
      case 'permiso_normativa':
        return {
          label: 'Permiso / DOM',
          icon: ShieldCheck,
          color: 'bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/30',
        };
      default:
        return {
          label: 'Otro Adjunto',
          icon: Paperclip,
          color: 'bg-gray-500/15 text-gray-600 dark:text-gray-400 border-gray-500/30',
        };
    }
  };

  const docsFiltrados = documentos.filter((d) => {
    const matchCat = categoriaActiva === 'todos' || d.categoria === categoriaActiva;
    const q = busqueda.toLowerCase().trim();
    const matchQuery =
      !q ||
      d.nombre.toLowerCase().includes(q) ||
      (d.descripcion || '').toLowerCase().includes(q) ||
      (d.proveedor_entidad || '').toLowerCase().includes(q) ||
      (d.numero_documento || '').toLowerCase().includes(q) ||
      (d.correo_asunto || '').toLowerCase().includes(q) ||
      (d.correo_remitente || '').toLowerCase().includes(q);
    return matchCat && matchQuery;
  });

  const totalFacturadoDocs = documentos
    .filter((d) => d.categoria === 'factura_boleta')
    .reduce((acc, d) => acc + (d.monto_documento || 0), 0);

  if (!proyecto) {
    return (
      <div className="p-8 text-center text-gray-500 font-mono text-sm">
        Cargando repositorio documental...
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-screen bg-[#FAF8F5] dark:bg-[#0E131B] pb-16">
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-[#1E1E1E] text-white px-4 py-3 rounded-2xl shadow-2xl border border-[#FF6A00] flex items-center gap-2 text-xs font-semibold">
          <Sparkles className="w-4 h-4 text-[#FF6A00] shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      <ProjectTabsHeader
        proyecto={proyecto}
        cliente={cliente}
        onOpenMaps={() => setIsMapsModalOpen(true)}
      />

      <div className="p-4 sm:p-6 max-w-7xl w-full mx-auto space-y-6">
        {/* Encabezado y Acciones Rápidas */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-lg sm:text-xl font-heading font-bold text-navy-900 dark:text-white">
              Repositorio Documental de Obra
            </h2>
            <p className="text-xs text-gray-600 dark:text-gray-400">
              Centraliza contratos, planos, facturas, boletas, permisos DOM y respaldos de correos asociados en Supabase Storage.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => handleOpenModal('contrato')}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#FF6A00] hover:bg-[#E05E00] text-white text-xs font-heading font-bold shadow-md transition-all"
            >
              <Upload className="w-4 h-4" />
              <span>Subir Documento / Plano / Factura</span>
            </button>
            <button
              onClick={() => handleOpenModal('correo')}
              className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-white dark:bg-[#141A23] border border-kraft-200 dark:border-[#263040] hover:border-[#FF6A00] text-navy-900 dark:text-white text-xs font-heading font-bold shadow-sm transition-all"
            >
              <Mail className="w-4 h-4 text-amber-500" />
              <span>Registrar Correo Asociado</span>
            </button>
          </div>
        </div>

        {/* KPIs del Repositorio */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white dark:bg-[#141A23] p-4 rounded-2xl border border-kraft-200 dark:border-[#263040] shadow-sm">
            <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
              <span>Total Archivos & Respaldos</span>
              <FolderOpen className="w-4 h-4 text-[#FF6A00]" />
            </div>
            <p className="text-xl font-heading font-black text-navy-900 dark:text-white">
              {documentos.length}
            </p>
            <p className="text-[11px] text-gray-500 mt-1">Almacenados por obra</p>
          </div>

          <div className="bg-white dark:bg-[#141A23] p-4 rounded-2xl border border-kraft-200 dark:border-[#263040] shadow-sm">
            <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
              <span>Contratos y Planos</span>
              <Map className="w-4 h-4 text-cyan-500" />
            </div>
            <p className="text-xl font-heading font-black text-navy-900 dark:text-white">
              {documentos.filter((d) => d.categoria === 'contrato' || d.categoria === 'plano').length}
            </p>
            <p className="text-[11px] text-gray-500 mt-1">Documentación técnica y legal</p>
          </div>

          <div className="bg-white dark:bg-[#141A23] p-4 rounded-2xl border border-kraft-200 dark:border-[#263040] shadow-sm">
            <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
              <span>Facturación / Boletas</span>
              <Receipt className="w-4 h-4 text-emerald-500" />
            </div>
            <p className="text-xl font-heading font-black text-navy-900 dark:text-white">
              {formatCLP(totalFacturadoDocs)}
            </p>
            <p className="text-[11px] text-gray-500 mt-1">
              {documentos.filter((d) => d.categoria === 'factura_boleta').length} comprobantes tributarios
            </p>
          </div>

          <div className="bg-white dark:bg-[#141A23] p-4 rounded-2xl border border-kraft-200 dark:border-[#263040] shadow-sm">
            <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
              <span>Correos Asociados</span>
              <Mail className="w-4 h-4 text-amber-500" />
            </div>
            <p className="text-xl font-heading font-black text-navy-900 dark:text-white">
              {documentos.filter((d) => d.categoria === 'correo').length}
            </p>
            <p className="text-[11px] text-gray-500 mt-1">Comunicaciones y acuerdos formales</p>
          </div>
        </div>

        {/* Barra de Filtros y Buscador */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            {[
              { id: 'todos', label: 'Todos' },
              { id: 'contrato', label: '📜 Contratos' },
              { id: 'plano', label: '📐 Planos' },
              { id: 'factura_boleta', label: '🧾 Facturas & Boletas' },
              { id: 'correo', label: '📧 Correos Asociados' },
              { id: 'permiso_normativa', label: '🏛️ Permisos / DOM' },
              { id: 'otro', label: '📎 Otros' },
            ].map((cat) => (
              <button
                key={cat.id}
                onClick={() => setCategoriaActiva(cat.id)}
                className={`px-3 py-2 rounded-xl text-xs font-heading font-bold whitespace-nowrap transition-all ${
                  categoriaActiva === cat.id
                    ? 'bg-[#1E1E1E] dark:bg-[#FF6A00] text-white shadow'
                    : 'bg-white dark:bg-[#141A23] text-gray-600 dark:text-gray-300 border border-kraft-200 dark:border-[#263040] hover:border-[#FF6A00]'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>

          <div className="relative w-full md:w-72">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar contrato, plano, folio, correo..."
              className="w-full pl-9 pr-3 py-2 rounded-xl bg-white dark:bg-[#141A23] border border-kraft-200 dark:border-[#263040] text-xs text-navy-900 dark:text-white"
            />
          </div>
        </div>

        {/* Grilla Documental */}
        {docsFiltrados.length === 0 ? (
          <div className="bg-white dark:bg-[#141A23] rounded-2xl border border-dashed border-kraft-300 dark:border-[#263040] p-10 text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-[#FF6A00]/10 text-[#FF6A00] flex items-center justify-center mx-auto">
              <FolderOpen className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-heading font-bold text-navy-900 dark:text-white">
              Repositorio vacío en esta categoría
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 max-w-md mx-auto">
              Adjunta el contrato firmado con el cliente, planos arquitectónicos o eléctricos, boletas/facturas de compra de insumos y respaldos de correos electrónicos.
            </p>
            <div className="flex items-center justify-center gap-2 pt-1">
              <button
                onClick={() => handleOpenModal('contrato')}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#FF6A00] text-white text-xs font-bold"
              >
                <Plus className="w-4 h-4" />
                <span>Subir primer documento</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {docsFiltrados.map((doc) => {
              const meta = getCategoriaMeta(doc.categoria);
              const Icon = meta.icon;
              return (
                <div
                  key={doc.id}
                  className="bg-white dark:bg-[#141A23] rounded-2xl border border-kraft-200 dark:border-[#263040] p-4 shadow-sm flex flex-col justify-between space-y-3 hover:border-[#FF6A00]/60 transition-colors"
                >
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${meta.color}`}
                      >
                        <Icon className="w-3.5 h-3.5" />
                        <span>{meta.label}</span>
                      </span>
                      <span className="text-[11px] font-mono text-gray-400">
                        {formatDate(doc.fecha_documento)}
                      </span>
                    </div>

                    <h3 className="text-sm font-heading font-bold text-navy-900 dark:text-white line-clamp-2">
                      {doc.nombre}
                    </h3>

                    {doc.descripcion && (
                      <p className="text-xs text-gray-600 dark:text-gray-400 line-clamp-2">
                        {doc.descripcion}
                      </p>
                    )}

                    {/* Metadatos específicos de Factura/Boleta */}
                    {doc.categoria === 'factura_boleta' && (
                      <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-2.5 text-xs space-y-1">
                        {doc.proveedor_entidad && (
                          <p className="text-gray-700 dark:text-gray-300">
                            <strong>Proveedor:</strong> {doc.proveedor_entidad}
                          </p>
                        )}
                        {doc.numero_documento && (
                          <p className="text-gray-700 dark:text-gray-300 font-mono">
                            <strong>Folio / N°:</strong> {doc.numero_documento}
                          </p>
                        )}
                        {doc.monto_documento != null && (
                          <p className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                            Monto: {formatCLP(doc.monto_documento)}
                          </p>
                        )}
                      </div>
                    )}

                    {/* Metadatos específicos de Correo Asociado */}
                    {doc.categoria === 'correo' && (
                      <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-2.5 text-xs space-y-1">
                        {doc.correo_remitente && (
                          <p className="truncate text-gray-700 dark:text-gray-300">
                            <strong>De:</strong> {doc.correo_remitente}
                          </p>
                        )}
                        {doc.correo_asunto && (
                          <p className="truncate text-gray-700 dark:text-gray-300">
                            <strong>Asunto:</strong> {doc.correo_asunto}
                          </p>
                        )}
                      </div>
                    )}

                    {doc.archivo_nombre && (
                      <p className="text-[11px] font-mono text-gray-500 truncate">
                        📎 {doc.archivo_nombre} {doc.archivo_tamano ? `(${formatBytes(doc.archivo_tamano)})` : ''}
                      </p>
                    )}
                  </div>

                  {/* Acciones del Documento */}
                  <div className="flex items-center justify-between pt-2 border-t border-kraft-100 dark:border-[#1E2530]">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setDocPreview(doc)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-kraft-100 dark:bg-[#1E2530] hover:bg-[#FF6A00] hover:text-white text-navy-900 dark:text-gray-200 text-xs font-bold transition-colors"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>Ver detalle</span>
                      </button>

                      {doc.archivo_url && (
                        <a
                          href={doc.archivo_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#FF6A00]/10 text-[#FF6A00] hover:bg-[#FF6A00] hover:text-white text-xs font-bold transition-colors"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>Abrir / Descargar</span>
                        </a>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => handleEliminar(doc.id)}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 transition-colors"
                      title="Eliminar"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal Subir Documento o Registrar Correo */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/70 backdrop-blur-sm overflow-y-auto">
          <div className="bg-white dark:bg-[#141A23] rounded-2xl max-w-xl w-full p-5 sm:p-6 shadow-2xl border border-kraft-200 dark:border-[#263040] my-auto max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-kraft-100 dark:border-[#263040]">
              <h3 className="text-base sm:text-lg font-heading font-bold text-navy-900 dark:text-white">
                Agregar al Repositorio de la Obra
              </h3>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleGuardarDocumento} className="space-y-4 mt-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-navy-900 dark:text-gray-200 mb-1">
                    Categoría Documental
                  </label>
                  <select
                    value={categoria}
                    onChange={(e) => setCategoria(e.target.value as CategoriaDocumentoObra)}
                    className="w-full px-3 py-2 rounded-xl border border-kraft-200 dark:border-[#263040] bg-[#FAF8F5] dark:bg-[#1E2530] text-xs font-medium text-navy-900 dark:text-white"
                  >
                    <option value="contrato">📜 Contrato / Anexo Contractual</option>
                    <option value="plano">📐 Plano / Especificación Técnica</option>
                    <option value="factura_boleta">🧾 Factura / Boleta / Orden de Compra</option>
                    <option value="correo">📧 Correo Asociado / Respaldo Formal</option>
                    <option value="permiso_normativa">🏛️ Permiso Municipal / DOM</option>
                    <option value="otro">📎 Otro Documento</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-navy-900 dark:text-gray-200 mb-1">
                    Fecha del Documento
                  </label>
                  <input
                    type="date"
                    value={fechaDocumento}
                    onChange={(e) => setFechaDocumento(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-kraft-200 dark:border-[#263040] bg-[#FAF8F5] dark:bg-[#1E2530] text-xs text-navy-900 dark:text-white"
                  />
                </div>
              </div>

              {/* Zona de Carga de Archivo en Supabase Storage */}
              <div className="border-2 border-dashed border-kraft-300 dark:border-[#263040] rounded-2xl p-4 text-center bg-[#FAF8F5] dark:bg-[#1A222D]">
                <label className="cursor-pointer flex flex-col items-center gap-1.5">
                  <Upload className="w-6 h-6 text-[#FF6A00]" />
                  <span className="text-xs font-bold text-navy-900 dark:text-white">
                    {isUploading
                      ? 'Subiendo archivo a Supabase Storage...'
                      : archivoNombre
                      ? `✅ ${archivoNombre}`
                      : 'Haz clic para seleccionar archivo (PDF, Plano, Imagen, Excel, Word)'}
                  </span>
                  <span className="text-[11px] text-gray-500">
                    Bucket seguro en la nube: documentos-obra (máx. 25 MB)
                  </span>
                  <input type="file" onChange={handleFileUpload} className="hidden" />
                </label>
              </div>

              <div>
                <label className="block text-xs font-bold text-navy-900 dark:text-gray-200 mb-1">
                  Nombre o Título del Documento *
                </label>
                <input
                  type="text"
                  required={categoria !== 'correo'}
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  placeholder="Ej: Contrato Construcción Suma Alzada Firmado / Plano Eléctrico v2"
                  className="w-full px-3.5 py-2 rounded-xl border border-kraft-200 dark:border-[#263040] bg-[#FAF8F5] dark:bg-[#1E2530] text-xs text-navy-900 dark:text-white"
                />
              </div>

              {/* Campos adicionales para Facturas / Boletas */}
              {categoria === 'factura_boleta' && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-emerald-500/5 p-3 rounded-xl border border-emerald-500/20">
                  <div>
                    <label className="block text-[11px] font-bold text-navy-900 dark:text-gray-200 mb-1">
                      N° Folio / Boleta
                    </label>
                    <input
                      type="text"
                      value={numeroDocumento}
                      onChange={(e) => setNumeroDocumento(e.target.value)}
                      placeholder="Ej: Factura #45821"
                      className="w-full px-2.5 py-1.5 rounded-lg border border-kraft-200 dark:border-[#263040] bg-white dark:bg-[#141A23] text-xs text-navy-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-navy-900 dark:text-gray-200 mb-1">
                      Proveedor / Tienda
                    </label>
                    <input
                      type="text"
                      value={proveedorEntidad}
                      onChange={(e) => setProveedorEntidad(e.target.value)}
                      placeholder="Ej: Sodimac / Construmart"
                      className="w-full px-2.5 py-1.5 rounded-lg border border-kraft-200 dark:border-[#263040] bg-white dark:bg-[#141A23] text-xs text-navy-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-navy-900 dark:text-gray-200 mb-1">
                      Monto Total (CLP)
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={montoDocumento}
                      onChange={(e) => setMontoDocumento(e.target.value)}
                      placeholder="Ej: 345900"
                      className="w-full px-2.5 py-1.5 rounded-lg border border-kraft-200 dark:border-[#263040] bg-white dark:bg-[#141A23] text-xs text-navy-900 dark:text-white"
                    />
                  </div>
                </div>
              )}

              {/* Campos adicionales para Correos Asociados */}
              {categoria === 'correo' && (
                <div className="space-y-3 bg-amber-500/5 p-3.5 rounded-xl border border-amber-500/20">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div>
                      <label className="block text-[11px] font-bold text-navy-900 dark:text-gray-200 mb-1">
                        De (Remitente)
                      </label>
                      <input
                        type="text"
                        value={correoRemitente}
                        onChange={(e) => setCorreoRemitente(e.target.value)}
                        placeholder="cliente@correo.cl"
                        className="w-full px-2.5 py-1.5 rounded-lg border border-kraft-200 dark:border-[#263040] bg-white dark:bg-[#141A23] text-xs text-navy-900 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-navy-900 dark:text-gray-200 mb-1">
                        Para (Destinatario)
                      </label>
                      <input
                        type="text"
                        value={correoDestinatario}
                        onChange={(e) => setCorreoDestinatario(e.target.value)}
                        placeholder="constructora@obratrack.cl"
                        className="w-full px-2.5 py-1.5 rounded-lg border border-kraft-200 dark:border-[#263040] bg-white dark:bg-[#141A23] text-xs text-navy-900 dark:text-white"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-navy-900 dark:text-gray-200 mb-1">
                      Asunto del Correo
                    </label>
                    <input
                      type="text"
                      value={correoAsunto}
                      onChange={(e) => setCorreoAsunto(e.target.value)}
                      placeholder="Ej: Aprobación presupuesto adicional y elección porcelanato"
                      className="w-full px-2.5 py-1.5 rounded-lg border border-kraft-200 dark:border-[#263040] bg-white dark:bg-[#141A23] text-xs text-navy-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-navy-900 dark:text-gray-200 mb-1">
                      Contenido / Acuerdo Formal del Correo
                    </label>
                    <textarea
                      rows={4}
                      value={correoCuerpo}
                      onChange={(e) => setCorreoCuerpo(e.target.value)}
                      placeholder="Pega aquí el contenido del correo o acuerdo con el mandante/arquitecto..."
                      className="w-full px-2.5 py-1.5 rounded-lg border border-kraft-200 dark:border-[#263040] bg-white dark:bg-[#141A23] text-xs text-navy-900 dark:text-white"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-navy-900 dark:text-gray-200 mb-1">
                  Notas u Observaciones
                </label>
                <textarea
                  rows={2}
                  value={descripcion}
                  onChange={(e) => setDescripcion(e.target.value)}
                  placeholder="Descripción breve o versión del plano/contrato..."
                  className="w-full px-3.5 py-2 rounded-xl border border-kraft-200 dark:border-[#263040] bg-[#FAF8F5] dark:bg-[#1E2530] text-xs text-navy-900 dark:text-white"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-kraft-100 dark:border-[#263040]">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-kraft-100 dark:bg-[#1E2530] text-xs font-bold text-navy-900 dark:text-gray-300"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isUploading}
                  className="px-5 py-2 rounded-xl bg-[#FF6A00] hover:bg-[#E05E00] disabled:opacity-50 text-white text-xs font-heading font-bold shadow"
                >
                  Guardar en Repositorio
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Vista Previa de Documento o Correo */}
      {docPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
          <div className="bg-white dark:bg-[#141A23] rounded-2xl max-w-3xl w-full p-5 sm:p-6 shadow-2xl border border-kraft-200 dark:border-[#263040] max-h-[90vh] overflow-y-auto space-y-4">
            <div className="flex items-center justify-between border-b border-kraft-100 dark:border-[#263040] pb-3">
              <div>
                <h3 className="text-base font-heading font-bold text-navy-900 dark:text-white">
                  {docPreview.nombre}
                </h3>
                <p className="text-xs text-gray-500">
                  Fecha: {formatDate(docPreview.fecha_documento)} • Subido por:{' '}
                  {docPreview.subido_por_nombre || 'Administración'}
                </p>
              </div>
              <button
                onClick={() => setDocPreview(null)}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {docPreview.descripcion && (
              <p className="text-xs text-gray-700 dark:text-gray-300">{docPreview.descripcion}</p>
            )}

            {docPreview.categoria === 'correo' && (
              <div className="bg-[#FAF8F5] dark:bg-[#1A222D] p-4 rounded-xl border border-kraft-200 dark:border-[#263040] space-y-2 text-xs">
                <p>
                  <strong>De:</strong> {docPreview.correo_remitente || 'No especificado'}
                </p>
                <p>
                  <strong>Para:</strong> {docPreview.correo_destinatario || 'No especificado'}
                </p>
                <p>
                  <strong>Asunto:</strong> {docPreview.correo_asunto || docPreview.nombre}
                </p>
                {docPreview.correo_cuerpo && (
                  <div className="pt-2 border-t border-kraft-200 dark:border-[#263040] whitespace-pre-line text-gray-700 dark:text-gray-200">
                    {docPreview.correo_cuerpo}
                  </div>
                )}
              </div>
            )}

            {docPreview.archivo_url && (
              <div className="space-y-3">
                {docPreview.mime_type?.startsWith('image/') ? (
                  <img
                    src={docPreview.archivo_url}
                    alt={docPreview.nombre}
                    className="w-full max-h-[60vh] object-contain rounded-xl border border-kraft-200"
                  />
                ) : docPreview.mime_type === 'application/pdf' ? (
                  <iframe
                    src={docPreview.archivo_url}
                    title={docPreview.nombre}
                    className="w-full h-[60vh] rounded-xl border border-kraft-200"
                  />
                ) : null}

                <div className="flex justify-end">
                  <a
                    href={docPreview.archivo_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#FF6A00] text-white text-xs font-bold"
                  >
                    <Download className="w-4 h-4" />
                    <span>Abrir archivo original en nueva pestaña</span>
                  </a>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <GoogleMapsProjectViewer
        proyecto={proyecto}
        isOpen={isMapsModalOpen}
        onClose={() => setIsMapsModalOpen(false)}
      />
    </div>
  );
}
