'use client';

import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import {
  AlertCircle,
  Building2,
  Check,
  FileText,
  KeyRound,
  Loader2,
  Plus,
  RotateCcw,
  Upload,
  User,
  X,
} from 'lucide-react';
import ModalOverlay from '@/components/ModalOverlay';
import Logo from '@/components/Logo';
import { dataService } from '@/lib/data-service';
import { aiHeaders } from '@/lib/ai/client';
import { formatRUT, validarRutChileno } from '@/lib/utils';
import { normalizeSpecialties, parseSpecialties } from '@/lib/team-specialties';
import type { Empresa, EmpresaConfiguracion, Usuario } from '@/types/database';

interface ProfileSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRequestChangePassword?: () => void;
}

type ProfileTab = 'perfil' | 'empresa' | 'cotizaciones';

const MAX_RAW_LOGO_BYTES = 5 * 1024 * 1024;
const MAX_LOGO_WIDTH = 420;
const MAX_LOGO_HEIGHT = 160;
const MAX_DATA_URL_CHARS = 850_000;

async function resizeLogoToDataUrl(file: File): Promise<string> {
  if (!/^image\/(png|jpeg|jpg|webp)$/i.test(file.type)) {
    throw new Error('Selecciona una imagen en formato PNG, JPG o WebP.');
  }
  if (file.size > MAX_RAW_LOGO_BYTES) {
    throw new Error('La imagen original supera los 5 MB. Elige un archivo más liviano.');
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error('No se pudo leer el archivo de imagen seleccionado.'));
      element.src = objectUrl;
    });

    const naturalW = img.naturalWidth || img.width;
    const naturalH = img.naturalHeight || img.height;
    if (!naturalW || !naturalH) {
      throw new Error('La imagen seleccionada no tiene dimensiones válidas.');
    }

    const scale = Math.min(1, MAX_LOGO_WIDTH / naturalW, MAX_LOGO_HEIGHT / naturalH);
    const targetW = Math.max(1, Math.round(naturalW * scale));
    const targetH = Math.max(1, Math.round(naturalH * scale));

    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Tu navegador no pudo procesar el logo seleccionado.');
    }
    ctx.clearRect(0, 0, targetW, targetH);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, targetW, targetH);

    let dataUrl = canvas.toDataURL('image/png');
    if (dataUrl.length > MAX_DATA_URL_CHARS) {
      dataUrl = canvas.toDataURL('image/webp', 0.86);
    }
    if (dataUrl.length > MAX_DATA_URL_CHARS) {
      dataUrl = canvas.toDataURL('image/jpeg', 0.84);
    }
    if (dataUrl.length > MAX_DATA_URL_CHARS) {
      throw new Error('El logo procesado sigue siendo demasiado pesado. Prueba con una imagen más simple.');
    }
    return dataUrl;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export default function ProfileSettingsModal({
  isOpen,
  onClose,
  onRequestChangePassword,
}: ProfileSettingsModalProps) {
  const [activeTab, setActiveTab] = useState<ProfileTab>('perfil');
  const [loadingRemote, setLoadingRemote] = useState(false);
  const [saving, setSaving] = useState(false);
  const [processingLogo, setProcessingLogo] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const [role, setRole] = useState<Usuario['rol']>('admin');
  const [isDev, setIsDev] = useState(false);
  const [emailAcceso, setEmailAcceso] = useState('');

  // Tab 1: Mi Perfil
  const [nombre, setNombre] = useState('');
  const [rut, setRut] = useState('');
  const [telefonoWhatsapp, setTelefonoWhatsapp] = useState('');
  const [email, setEmail] = useState('');
  const [especialidades, setEspecialidades] = useState<string[]>([]);
  const [specialtyInput, setSpecialtyInput] = useState('');

  // Tab 2: Empresa y Logo
  const [empresaNombre, setEmpresaNombre] = useState('');
  const [empresaRut, setEmpresaRut] = useState('');
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [giro, setGiro] = useState('');
  const [direccion, setDireccion] = useState('');
  const [comuna, setComuna] = useState('');
  const [telefonoComercial, setTelefonoComercial] = useState('');
  const [emailComercial, setEmailComercial] = useState('');
  const [sitioWeb, setSitioWeb] = useState('');

  // Tab 3: Cotizaciones y Cobros
  const [firmaTexto, setFirmaTexto] = useState('');
  const [condicionesPagoDefecto, setCondicionesPagoDefecto] = useState('');
  const [mostrarDatosBancarios, setMostrarDatosBancarios] = useState(false);
  const [datosBancarios, setDatosBancarios] = useState('');

  const dirtyRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hydrateFromEntities = (user: Usuario | null, company: Empresa | null) => {
    const cfg: EmpresaConfiguracion =
      company?.configuracion || user?.empresa_configuracion || {};
    setRole(user?.rol || 'admin');
    setIsDev(Boolean(user?.is_dev));
    setEmailAcceso(user?.email_acceso || user?.email || '');
    setNombre(user?.nombre || '');
    setRut(user?.rut || '');
    setTelefonoWhatsapp(user?.telefono_whatsapp || '');
    setEmail(user?.email || '');
    setEspecialidades(Array.isArray(user?.especialidades) ? user.especialidades : []);
    setSpecialtyInput('');

    setEmpresaNombre(company?.nombre || user?.empresa_nombre || '');
    setEmpresaRut(company?.rut ?? user?.empresa_rut ?? '');
    setLogoUrl(company?.logo_url ?? user?.empresa_logo_url ?? null);
    setGiro(cfg.giro || '');
    setDireccion(cfg.direccion || '');
    setComuna(cfg.comuna || '');
    setTelefonoComercial(cfg.telefono_comercial || '');
    setEmailComercial(cfg.email_comercial || '');
    setSitioWeb(cfg.sitio_web || '');
    setFirmaTexto(cfg.firma_texto || '');
    setCondicionesPagoDefecto(cfg.condiciones_pago_defecto || '');
    setMostrarDatosBancarios(Boolean(cfg.mostrar_datos_bancarios));
    setDatosBancarios(cfg.datos_bancarios || '');
  };

  useEffect(() => {
    if (!isOpen) return;
    let active = true;
    dirtyRef.current = false;
    setActiveTab('perfil');
    setError('');
    setSuccessMsg('');
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }

    hydrateFromEntities(dataService.getActiveUser(), dataService.getEmpresa());

    const fetchFreshProfile = async () => {
      setLoadingRemote(true);
      try {
        const res = await fetch('/api/perfil', {
          method: 'GET',
          headers: await aiHeaders(),
          cache: 'no-store',
        });
        if (!res.ok) return;
        const data = await res.json();
        if (!active || !data?.usuario) return;
        dataService.applyLocalProfileUpdate(data.usuario, data.empresa || null);
        if (!dirtyRef.current) {
          hydrateFromEntities(data.usuario, data.empresa || null);
        }
      } catch {
        // Mantiene caché local si no hay conexión en ese momento.
      } finally {
        if (active) setLoadingRemote(false);
      }
    };

    void fetchFreshProfile();
    return () => {
      active = false;
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const isAdmin = role === 'admin';

  const markDirty = () => {
    dirtyRef.current = true;
    if (error) setError('');
    if (successMsg) setSuccessMsg('');
  };

  const addSpecialtiesFromInput = () => {
    const parsed = parseSpecialties(specialtyInput);
    if (parsed.length === 0) return;
    markDirty();
    setEspecialidades((prev) => normalizeSpecialties([...prev, ...parsed]));
    setSpecialtyInput('');
  };

  const removeSpecialty = (item: string) => {
    markDirty();
    setEspecialidades((prev) => prev.filter((s) => s !== item));
  };

  const handleLogoSelected = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !isAdmin) return;
    setProcessingLogo(true);
    setError('');
    setSuccessMsg('');
    try {
      const processed = await resizeLogoToDataUrl(file);
      dirtyRef.current = true;
      setLogoUrl(processed);
    } catch (err) {
      setError((err as Error).message || 'No se pudo cargar el logo seleccionado.');
    } finally {
      setProcessingLogo(false);
    }
  };

  const handleResetLogo = () => {
    if (!isAdmin) return;
    markDirty();
    setLogoUrl(null);
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setSuccessMsg('');

    const cleanNombre = nombre.trim();
    if (cleanNombre.length < 2) {
      setActiveTab('perfil');
      setError('Ingresa tu nombre completo (mínimo 2 caracteres).');
      return;
    }

    const cleanRut = rut.trim();
    if (cleanRut && !isDev && !validarRutChileno(cleanRut)) {
      setActiveTab('perfil');
      setError('El RUT personal ingresado no es válido. Revisa el dígito verificador.');
      return;
    }

    if (isAdmin) {
      const cleanEmpNombre = empresaNombre.trim();
      if (cleanEmpNombre.length < 2) {
        setActiveTab('empresa');
        setError('El nombre o razón social de la empresa debe tener al menos 2 caracteres.');
        return;
      }
      const cleanEmpRut = empresaRut.trim();
      if (cleanEmpRut && !isDev && !validarRutChileno(cleanEmpRut)) {
        setActiveTab('empresa');
        setError('El RUT de la empresa no es válido. Revisa el dígito verificador.');
        return;
      }
    }

    const pendingSpecs = specialtyInput.trim()
      ? normalizeSpecialties([...especialidades, ...parseSpecialties(specialtyInput)])
      : especialidades;

    const payload: Record<string, unknown> = {
      usuario: {
        nombre: cleanNombre,
        rut: cleanRut ? (validarRutChileno(cleanRut) ? formatRUT(cleanRut) : cleanRut) : '',
        telefono_whatsapp: telefonoWhatsapp.trim(),
        email: email.trim(),
        especialidades: pendingSpecs,
      },
    };

    if (isAdmin) {
      payload.empresa = {
        nombre: empresaNombre.trim(),
        rut: empresaRut.trim()
          ? (validarRutChileno(empresaRut.trim()) ? formatRUT(empresaRut.trim()) : empresaRut.trim())
          : '',
        logo_url: logoUrl,
        configuracion: {
          giro: giro.trim(),
          direccion: direccion.trim(),
          comuna: comuna.trim(),
          telefono_comercial: telefonoComercial.trim(),
          email_comercial: emailComercial.trim(),
          sitio_web: sitioWeb.trim(),
          firma_texto: firmaTexto.trim(),
          condiciones_pago_defecto: condicionesPagoDefecto.trim(),
          datos_bancarios: datosBancarios.trim(),
          mostrar_datos_bancarios: mostrarDatosBancarios,
        },
      };
    }

    setSaving(true);
    try {
      const response = await fetch('/api/perfil', {
        method: 'PATCH',
        headers: await aiHeaders(),
        body: JSON.stringify(payload),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result?.error || 'No se pudieron guardar los cambios del perfil.');
      }

      if (result?.usuario) {
        dataService.applyLocalProfileUpdate(result.usuario, result.empresa || null);
      }
      if (pendingSpecs !== especialidades) {
        setEspecialidades(pendingSpecs);
        setSpecialtyInput('');
      }
      dirtyRef.current = false;
      window.dispatchEvent(new CustomEvent('obratrack_profile_updated', { detail: result }));
      window.dispatchEvent(new Event('obratrack_cloud_synced'));
      setSuccessMsg('Perfil y configuración guardados.');
      closeTimerRef.current = setTimeout(() => {
        onClose();
      }, 650);
    } catch (err) {
      setError((err as Error).message || 'Error al guardar el perfil.');
    } finally {
      setSaving(false);
    }
  };

  const tabs: { id: ProfileTab; label: string; icon: typeof User }[] = [
    { id: 'perfil', label: 'Mi Perfil', icon: User },
    { id: 'empresa', label: 'Empresa y Logo', icon: Building2 },
    { id: 'cotizaciones', label: 'Cotizaciones y Cobros', icon: FileText },
  ];

  const inputClass =
    'w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-[#FAF8F5] dark:bg-[#0D1117] px-3.5 py-2.5 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:border-[#FF6A00] focus:outline-none focus:ring-2 focus:ring-[#FF6A00]/20 disabled:opacity-60 disabled:cursor-not-allowed';
  const labelClass = 'block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5';

  return (
    <ModalOverlay
      onClose={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-label="Editar perfil de cuenta y empresa"
    >
      <div className="relative flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-[#141A23] text-gray-900 dark:text-gray-100 shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-gray-200 dark:border-gray-800 px-6 py-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold tracking-tight">Editar perfil</h2>
              {loadingRemote && (
                <Loader2 className="h-4 w-4 animate-spin text-[#FF6A00]" aria-label="Sincronizando perfil" />
              )}
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              Personaliza tus datos, el logo de tu empresa y el membrete de cotizaciones y cobros.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-gray-200 dark:border-gray-800 bg-gray-50/70 dark:bg-[#0D1117]/60 px-6 pt-2.5">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const selected = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 rounded-t-xl border-b-2 px-3.5 py-2.5 text-xs font-semibold transition-colors ${
                  selected
                    ? 'border-[#FF6A00] bg-white dark:bg-[#141A23] text-[#FF6A00]'
                    : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
            {activeTab === 'perfil' && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="perfil-nombre" className={labelClass}>
                      Nombre completo *
                    </label>
                    <input
                      id="perfil-nombre"
                      type="text"
                      required
                      value={nombre}
                      onChange={(e) => {
                        markDirty();
                        setNombre(e.target.value);
                      }}
                      placeholder="Ej: Benjamín Arriagada"
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label htmlFor="perfil-rut" className={labelClass}>
                      RUT personal
                    </label>
                    <input
                      id="perfil-rut"
                      type="text"
                      value={rut}
                      onChange={(e) => {
                        markDirty();
                        setRut(e.target.value);
                      }}
                      onBlur={() => {
                        if (rut.trim() && validarRutChileno(rut)) {
                          setRut(formatRUT(rut));
                        }
                      }}
                      placeholder="Ej: 18.234.567-8"
                      className={inputClass}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="perfil-whatsapp" className={labelClass}>
                      Teléfono WhatsApp
                    </label>
                    <input
                      id="perfil-whatsapp"
                      type="tel"
                      value={telefonoWhatsapp}
                      onChange={(e) => {
                        markDirty();
                        setTelefonoWhatsapp(e.target.value);
                      }}
                      placeholder="Ej: +56 9 1234 5678"
                      className={inputClass}
                    />
                    <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">
                      Número conectado con ObraBot para registrar avances e incidencias.
                    </p>
                  </div>
                  <div>
                    <label htmlFor="perfil-email-contacto" className={labelClass}>
                      Correo de contacto / comercial
                    </label>
                    <input
                      id="perfil-email-contacto"
                      type="email"
                      value={email}
                      onChange={(e) => {
                        markDirty();
                        setEmail(e.target.value);
                      }}
                      placeholder="Ej: contacto@constructorachile.cl"
                      className={inputClass}
                    />
                  </div>
                </div>

                {/* Especialidades */}
                <div>
                  <label htmlFor="perfil-especialidades" className={labelClass}>
                    Especialidades / Oficios
                  </label>
                  <div className="flex gap-2">
                    <input
                      id="perfil-especialidades"
                      type="text"
                      value={specialtyInput}
                      onChange={(e) => setSpecialtyInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          addSpecialtiesFromInput();
                        }
                      }}
                      placeholder="Ej: Obra gruesa, Gasfitería, Remodelaciones..."
                      className={inputClass}
                    />
                    <button
                      type="button"
                      onClick={addSpecialtiesFromInput}
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-3.5 py-2 text-xs font-semibold hover:border-[#FF6A00] hover:text-[#FF6A00] transition-colors"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Agregar
                    </button>
                  </div>
                  {especialidades.length > 0 && (
                    <div className="mt-2.5 flex flex-wrap gap-1.5">
                      {especialidades.map((item) => (
                        <span
                          key={item}
                          className="inline-flex items-center gap-1.5 rounded-full bg-[#FF6A00]/10 px-3 py-1 text-xs font-medium text-[#FF6A00]"
                        >
                          {item}
                          <button
                            type="button"
                            onClick={() => removeSpecialty(item)}
                            aria-label={`Quitar ${item}`}
                            className="rounded-full p-0.5 hover:bg-[#FF6A00]/20"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Seguridad de acceso */}
                <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50/70 dark:bg-[#0D1117]/70 p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-xs font-semibold text-gray-800 dark:text-gray-200">
                        Cuenta de acceso
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                        {emailAcceso || 'Sin correo de acceso registrado'} ·{' '}
                        <span className="font-medium text-[#FF6A00]">
                          {role === 'admin'
                            ? 'Contratista / Admin'
                            : role === 'supervisor'
                            ? 'Supervisor'
                            : 'Maestro Terreno'}
                        </span>
                      </p>
                    </div>
                    {onRequestChangePassword && (
                      <button
                        type="button"
                        onClick={() => {
                          onClose();
                          onRequestChangePassword();
                        }}
                        className="inline-flex items-center gap-2 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-[#141A23] px-3.5 py-2 text-xs font-semibold hover:border-[#FF6A00] hover:text-[#FF6A00] transition-colors"
                      >
                        <KeyRound className="h-3.5 w-3.5" />
                        Cambiar contraseña
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'empresa' && (
              <div className="space-y-4">
                {!isAdmin && (
                  <div className="flex items-start gap-2.5 rounded-xl border border-amber-300/60 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-700/50 px-4 py-3 text-xs text-amber-800 dark:text-amber-200">
                    <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                    <p>
                      Solo el administrador de la empresa puede modificar los datos y el logo corporativo. Puedes ver la configuración actual en modo lectura.
                    </p>
                  </div>
                )}

                {/* Logo corporativo + Vista previa de membrete */}
                <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-gray-50/70 dark:bg-[#0D1117]/70 p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-200">
                        Logo de la empresa para cotizaciones y cobros
                      </p>
                      <p className="text-[11px] text-gray-500 dark:text-gray-400">
                        PNG con fondo transparente, JPG o WebP. Se ajusta automáticamente al encabezado PDF.
                      </p>
                    </div>
                    {isAdmin && (
                      <div className="flex items-center gap-2">
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept="image/png,image/jpeg,image/webp"
                          onChange={handleLogoSelected}
                          className="hidden"
                        />
                        <button
                          type="button"
                          disabled={processingLogo}
                          onClick={() => fileInputRef.current?.click()}
                          className="inline-flex items-center gap-1.5 rounded-xl bg-[#FF6A00] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#e55f00] disabled:opacity-60 transition-colors"
                        >
                          {processingLogo ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Upload className="h-3.5 w-3.5" />
                          )}
                          {logoUrl ? 'Cambiar logo' : 'Subir logo'}
                        </button>
                        {logoUrl && (
                          <button
                            type="button"
                            onClick={handleResetLogo}
                            className="inline-flex items-center gap-1.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-[#141A23] px-3 py-2 text-xs font-semibold text-gray-700 dark:text-gray-300 hover:border-red-500 hover:text-red-500 transition-colors"
                          >
                            <RotateCcw className="h-3.5 w-3.5" />
                            Restaurar logo de ObraTrack
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Vista previa membrete blanco (como en A4/PDF) */}
                  <div className="rounded-xl border border-gray-200 bg-white p-4 text-gray-900 shadow-xs">
                    <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                      Vista previa en encabezado de cotización
                    </p>
                    <div className="flex flex-wrap items-center justify-between gap-4 border-b border-gray-100 pb-3">
                      <div className="flex items-center gap-3 min-w-0">
                        {logoUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={logoUrl}
                            alt="Logo empresa"
                            className="h-12 max-w-[170px] object-contain"
                          />
                        ) : (
                          <Logo variant="horizontal" size="sm" theme="light" />
                        )}
                      </div>
                      <div className="text-right text-xs text-gray-600">
                        <p className="font-bold text-gray-900">
                          {empresaNombre.trim() || 'Tu Empresa Constructora'}
                        </p>
                        {empresaRut.trim() && <p>RUT: {empresaRut.trim()}</p>}
                        {giro.trim() && <p className="text-[11px] text-gray-500">{giro.trim()}</p>}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="empresa-nombre" className={labelClass}>
                      Nombre o Razón Social *
                    </label>
                    <input
                      id="empresa-nombre"
                      type="text"
                      disabled={!isAdmin}
                      value={empresaNombre}
                      onChange={(e) => {
                        markDirty();
                        setEmpresaNombre(e.target.value);
                      }}
                      placeholder="Ej: Constructora Sur SpA"
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label htmlFor="empresa-rut" className={labelClass}>
                      RUT de la empresa
                    </label>
                    <input
                      id="empresa-rut"
                      type="text"
                      disabled={!isAdmin}
                      value={empresaRut}
                      onChange={(e) => {
                        markDirty();
                        setEmpresaRut(e.target.value);
                      }}
                      onBlur={() => {
                        if (empresaRut.trim() && validarRutChileno(empresaRut)) {
                          setEmpresaRut(formatRUT(empresaRut));
                        }
                      }}
                      placeholder="Ej: 76.543.210-K"
                      className={inputClass}
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="empresa-giro" className={labelClass}>
                    Giro / Rubro comercial
                  </label>
                  <input
                    id="empresa-giro"
                    type="text"
                    disabled={!isAdmin}
                    value={giro}
                    onChange={(e) => {
                      markDirty();
                      setGiro(e.target.value);
                    }}
                    placeholder="Ej: Construcción, Remodelaciones y Obras Menores"
                    className={inputClass}
                  />
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="empresa-direccion" className={labelClass}>
                      Dirección comercial
                    </label>
                    <input
                      id="empresa-direccion"
                      type="text"
                      disabled={!isAdmin}
                      value={direccion}
                      onChange={(e) => {
                        markDirty();
                        setDireccion(e.target.value);
                      }}
                      placeholder="Ej: Av. Providencia 1234, Of. 402"
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label htmlFor="empresa-comuna" className={labelClass}>
                      Comuna / Ciudad
                    </label>
                    <input
                      id="empresa-comuna"
                      type="text"
                      disabled={!isAdmin}
                      value={comuna}
                      onChange={(e) => {
                        markDirty();
                        setComuna(e.target.value);
                      }}
                      placeholder="Ej: Providencia, Santiago"
                      className={inputClass}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div>
                    <label htmlFor="empresa-tel" className={labelClass}>
                      Teléfono comercial
                    </label>
                    <input
                      id="empresa-tel"
                      type="tel"
                      disabled={!isAdmin}
                      value={telefonoComercial}
                      onChange={(e) => {
                        markDirty();
                        setTelefonoComercial(e.target.value);
                      }}
                      placeholder="+56 9 8765 4321"
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label htmlFor="empresa-email" className={labelClass}>
                      Correo comercial
                    </label>
                    <input
                      id="empresa-email"
                      type="email"
                      disabled={!isAdmin}
                      value={emailComercial}
                      onChange={(e) => {
                        markDirty();
                        setEmailComercial(e.target.value);
                      }}
                      placeholder="ventas@tuempresa.cl"
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label htmlFor="empresa-web" className={labelClass}>
                      Sitio web
                    </label>
                    <input
                      id="empresa-web"
                      type="text"
                      disabled={!isAdmin}
                      value={sitioWeb}
                      onChange={(e) => {
                        markDirty();
                        setSitioWeb(e.target.value);
                      }}
                      placeholder="www.tuempresa.cl"
                      className={inputClass}
                    />
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'cotizaciones' && (
              <div className="space-y-4">
                {!isAdmin && (
                  <div className="flex items-start gap-2.5 rounded-xl border border-amber-300/60 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-700/50 px-4 py-3 text-xs text-amber-800 dark:text-amber-200">
                    <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                    <p>
                      Solo el administrador de la empresa puede modificar las preferencias de cotizaciones y cobros.
                    </p>
                  </div>
                )}

                <div>
                  <label htmlFor="cot-firma" className={labelClass}>
                    Texto de firma / representante en documentos
                  </label>
                  <input
                    id="cot-firma"
                    type="text"
                    disabled={!isAdmin}
                    value={firmaTexto}
                    onChange={(e) => {
                      markDirty();
                      setFirmaTexto(e.target.value);
                    }}
                    placeholder="Ej: Constructora Sur SpA · Juan Pérez"
                    className={inputClass}
                  />
                  <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">
                    Aparece debajo de la línea de firma del contratista en Cotizaciones y Estados de Pago.
                  </p>
                </div>

                <div>
                  <label htmlFor="cot-condiciones" className={labelClass}>
                    Condiciones comerciales y forma de pago por defecto
                  </label>
                  <textarea
                    id="cot-condiciones"
                    rows={3}
                    disabled={!isAdmin}
                    value={condicionesPagoDefecto}
                    onChange={(e) => {
                      markDirty();
                      setCondicionesPagoDefecto(e.target.value);
                    }}
                    placeholder="Ej: 50% de anticipo al aprobar el presupuesto, 30% avance obra gruesa y 20% contra entrega conforme."
                    className={inputClass}
                  />
                </div>

                <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50/70 dark:bg-[#0D1117]/70 p-4 space-y-3">
                  <label className="flex cursor-pointer items-center gap-3">
                    <input
                      type="checkbox"
                      disabled={!isAdmin}
                      checked={mostrarDatosBancarios}
                      onChange={(e) => {
                        markDirty();
                        setMostrarDatosBancarios(e.target.checked);
                      }}
                      className="h-4 w-4 rounded border-gray-300 text-[#FF6A00] focus:ring-[#FF6A00]"
                    />
                    <span className="text-xs font-semibold text-gray-800 dark:text-gray-200">
                      Incluir datos bancarios para transferencias en Cotizaciones y Estados de Pago
                    </span>
                  </label>

                  <div>
                    <label htmlFor="cot-banco" className={labelClass}>
                      Datos bancarios de transferencia
                    </label>
                    <textarea
                      id="cot-banco"
                      rows={4}
                      disabled={!isAdmin}
                      value={datosBancarios}
                      onChange={(e) => {
                        markDirty();
                        setDatosBancarios(e.target.value);
                      }}
                      placeholder={'Banco: Banco de Chile\nCuenta Corriente N°: 00-123-45678-90\nRUT: 76.543.210-K\nTitular: Constructora Sur SpA\nCorreo: pagos@tuempresa.cl'}
                      className={inputClass}
                    />
                  </div>
                </div>

                <p className="text-[11px] text-gray-500 dark:text-gray-400">
                  Estos valores se reflejan automáticamente en la vista previa e impresión/descarga PDF de tus Cotizaciones y Estados de Pago.
                </p>
              </div>
            )}
          </div>

          {/* Footer / Feedback */}
          <div className="border-t border-gray-200 dark:border-gray-800 bg-gray-50/60 dark:bg-[#0D1117]/60 px-6 py-4 space-y-3">
            {error && (
              <div
                role="alert"
                className="flex items-center gap-2 rounded-xl border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40 px-3.5 py-2.5 text-xs font-medium text-red-700 dark:text-red-300"
              >
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}
            {successMsg && (
              <div
                role="status"
                className="flex items-center gap-2 rounded-xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50 dark:bg-emerald-950/40 px-3.5 py-2.5 text-xs font-medium text-emerald-700 dark:text-emerald-300"
              >
                <Check className="h-4 w-4 shrink-0" />
                <span>{successMsg}</span>
              </div>
            )}

            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                disabled={saving}
                onClick={onClose}
                className="rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-[#141A23] px-4 py-2 text-xs font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={saving || processingLogo}
                className="inline-flex items-center gap-2 rounded-xl bg-[#FF6A00] px-5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-[#e55f00] disabled:opacity-60 transition-colors"
              >
                {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {saving ? 'Guardando...' : 'Guardar cambios'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </ModalOverlay>
  );
}
