'use client';
import ModalOverlay from '@/components/ModalOverlay';

import React, { useEffect, useRef, useState } from 'react';
import { Download, Printer, X, MessageCircle, User, Briefcase, FileText, DollarSign, Loader2, Pencil } from 'lucide-react';
import { dataService } from '@/lib/data-service';
import type { CotizacionEstimacion } from '@/types/database';
import { buildQuoteDocument, quoteMoney, type QuoteDocumentOptions } from '@/lib/quotes/document';
import Logo from './Logo';
import QuoteEditor from './QuoteEditor';
import { aiHeaders } from '@/lib/ai/client';
import type { Presupuesto } from '@/lib/presupuestos';

interface CotizacionPdfModalProps extends Omit<QuoteDocumentOptions, 'emisor'> {
  isOpen: boolean;
  onClose: () => void;
  cotizacion: CotizacionEstimacion | null;
  onSaved?: (row: Presupuesto) => void;
  startEditing?: boolean;
  readOnly?: boolean;
}

export default function CotizacionPdfModal({ isOpen, onClose, cotizacion, onSaved, startEditing = false, readOnly = false, ...client }: CotizacionPdfModalProps) {
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState('');
  const [current, setCurrent] = useState<CotizacionEstimacion | null>(null);
  const [editing, setEditing] = useState(false);
  const [notice, setNotice] = useState('');
  const [profileTick, setProfileTick] = useState(0);
  const saveRevision = useRef(0);
  useEffect(() => {
    const refreshProfile = () => setProfileTick((n) => n + 1);
    window.addEventListener('obratrack_profile_updated', refreshProfile);
    window.addEventListener('obratrack_cloud_synced', refreshProfile);
    return () => {
      window.removeEventListener('obratrack_profile_updated', refreshProfile);
      window.removeEventListener('obratrack_cloud_synced', refreshProfile);
    };
  }, []);
  useEffect(() => {
    setCurrent(cotizacion); setEditing(startEditing && !readOnly); setNotice('');
    if (readOnly || !isOpen || !cotizacion || !['admin', 'supervisor'].includes(dataService.getActiveUser()?.rol || '')) return;
    let active = true;
    const revision = saveRevision.current;
    void (async () => {
      try {
        const res = await fetch('/api/presupuestos?id=' + encodeURIComponent(cotizacion.id), { headers: await aiHeaders(), cache: 'no-store' });
        if (!res.ok) return;
        const body = await res.json();
        const saved = body.presupuestos?.find((row: Presupuesto) => row.id === cotizacion.id || row.cotizacion.id === cotizacion.id);
        if (active && saved && revision === saveRevision.current) setCurrent(saved.cotizacion);
      } catch { /* La copia disponible sigue siendo visible; editar requiere cargar la versión guardada. */ }
    })();
    return () => { active = false; };
  }, [isOpen, cotizacion?.id, startEditing, readOnly]);
  if (!isOpen || !cotizacion) return null;
  const visibleQuote = current?.id === cotizacion.id ? current : cotizacion;
  void profileTick;
  const activeUser = dataService.getActiveUser();
  const activeCompany = dataService.getEmpresa();
  const emisor = activeUser
    ? {
        ...activeUser,
        empresa_nombre: activeCompany?.nombre || activeUser.empresa_nombre,
        empresa_rut: activeCompany?.rut ?? activeUser.empresa_rut,
        empresa_logo_url: activeCompany?.logo_url ?? activeUser.empresa_logo_url,
        empresa_configuracion: activeCompany?.configuracion || activeUser.empresa_configuracion,
      }
    : activeCompany
      ? {
          empresa_nombre: activeCompany.nombre,
          empresa_rut: activeCompany.rut,
          empresa_logo_url: activeCompany.logo_url,
          empresa_configuracion: activeCompany.configuracion,
        }
      : null;
  const savedClient = visibleQuote.cliente_id ? dataService.getClientes().find((c) => c.id === visibleQuote.cliente_id) : undefined;
  const document = buildQuoteDocument(visibleQuote, {
    ...client,
    clienteEmail: client.clienteEmail ?? visibleQuote.cliente_email ?? savedClient?.email,
    clienteNombre: client.clienteNombre ?? visibleQuote.cliente_nombre ?? savedClient?.nombre,
    clienteTelefono: client.clienteTelefono ?? visibleQuote.cliente_telefono ?? savedClient?.telefono,
    emisor,
  });

  const handleDownload = async () => {
    if (downloading) return;
    setDownloading(true);
    setError('');
    try {
      // Carga el generador solo al descargar; no abre el diálogo de impresión.
      const { downloadQuotePdf } = await import('@/lib/quotes/pdf');
      downloadQuotePdf(document);
    } catch {
      setError('No se pudo generar el PDF. Intenta descargarlo nuevamente.');
    } finally {
      setDownloading(false);
    }
  };
  const handleShare = () => {
    const phone = document.cliente.telefono.replace(/[^0-9]/g, '');
    const message = `*COTIZACIÓN OBRATRACK N.° ${document.folio}*${document.fecha ? `\nFecha: ${document.fecha}` : ''}\n\n${document.proyecto.nombre}\n${document.proyecto.ubicacion}\n\nNeto: ${quoteMoney(document.subtotal)}\nIVA (19%): ${quoteMoney(document.iva)}\n*Total: ${quoteMoney(document.total)} CLP*\n\nCondiciones: ${document.condiciones}`;
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
  };
  const fields = (rows: [string, string][]) => rows.map(([label, value]) => (
    <div key={label} className="quote-field"><dt>{label}</dt><dd>{value}</dd></div>
  ));

  return (
    <ModalOverlay onClose={onClose} id="obratrack-quote-overlay" role="dialog" aria-modal="true" aria-label="Cotización generada" className="fixed inset-0 z-50 flex flex-col bg-black/75 backdrop-blur-sm">
      <style jsx global>{`
        .quote-toolbar { flex-shrink: 0; display: flex; justify-content: flex-end; align-items: center; gap: 8px; padding: 12px 16px; background: #1e1e1e; }
        .quote-toolbar button { display: inline-flex; align-items: center; gap: 6px; border-radius: 8px; padding: 10px 12px; color: white; font-size: 12px; font-weight: 700; }
        .quote-toolbar button:disabled { opacity: .65; cursor: wait; }
        @media (max-width: 640px) {
          .quote-toolbar { padding: 8px; gap: 4px; }
          .quote-toolbar button { padding: 10px 9px; font-size: 11px; }
        }
        .quote-scroll { flex: 1; overflow: auto; padding: 20px 12px; }
        .quote-paper { box-sizing: border-box; width: 210mm; min-height: 297mm; margin: 0 auto; padding: 12mm; background: white; color: #1e1e1e; font-family: Arial, Helvetica, sans-serif; font-size: 11px; line-height: 1.45; box-shadow: 0 16px 50px #0003; color-scheme: light; }
        .quote-header { display: flex; align-items: center; justify-content: space-between; gap: 20px; padding-bottom: 18px; }
        .quote-brand { width: 210px; flex-shrink: 0; }
        .quote-brand .logo-carbon-bar { fill: #222A37 !important; }
        .quote-brand .logo-carbon-text { color: #222A37 !important; }
        .quote-brand svg { width: 40px; height: 40px; }
        .quote-brand [class*="text-2xl"] { font-size: 26px; }
        .quote-heading { border-left: 1px solid #ff6a00; padding-left: 20px; min-width: 186px; }
        .quote-heading h1 { font-size: 22px; line-height: 1.1; font-weight: 800; margin: 0 0 8px; color: #1e1e1e; }
        .quote-heading p { margin: 2px 0; font-size: 9px; color: #666; }
        .quote-heading strong { color: #1e1e1e; }
        .quote-info { display: grid; grid-template-columns: 1fr 1fr; background: #f7f7f6; border-radius: 6px; padding: 14px; gap: 20px; }
        .quote-info > section { min-width: 0; }
        .quote-info > section + section { border-left: 1px solid #e4e4e4; padding-left: 20px; }
        .quote-section-title { color: #ff6a00; font-size: 10px; font-weight: 700; display: flex; align-items: center; gap: 6px; margin-bottom: 8px; }
        .quote-section-title svg { width: 14px; height: 14px; flex-shrink: 0; }
        .quote-field { display: grid; grid-template-columns: 68px 1fr; gap: 5px; margin-top: 4px; font-size: 10px; }
        .quote-field dt { font-weight: 700; }
        .quote-field dd { margin: 0; overflow-wrap: anywhere; }
        .quote-section-banner { display: flex; align-items: center; gap: 8px; margin: 16px 0 8px; }
        .quote-section-badge { width: 18px; height: 18px; border-radius: 9999px; background: #ea4c00; color: #fff; display: inline-flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; flex-shrink: 0; }
        .quote-section-badge > span { width: 7px; height: 1.8px; border-radius: 1px; background: #fff; display: block; }
        .quote-section-heading { font-size: 11px; font-weight: 800; letter-spacing: 0.04em; text-transform: uppercase; color: #141414; white-space: nowrap; }
        .quote-section-line { flex: 1; height: 1.5px; background: #ea4c00; }
        .quote-info + .quote-table, .quote-table + .quote-table { margin-top: 14px; }
        .quote-table { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 10px; }
        .quote-table th { background: #141414; color: white; padding: 8px 6px; text-transform: uppercase; font-size: 8px; font-weight: 700; text-align: left; }
        .quote-table th:first-child { text-align: center; }
        .quote-table td { padding: 8px 6px; border: 1px solid #e5e5e5; vertical-align: top; overflow-wrap: anywhere; }
        .quote-table tbody tr:nth-child(even) { background: #fafafa; }
        .quote-table td:first-child { background: #ea4c00; color: #ffffff; font-weight: 700; text-align: center; border-color: #e5e5e5; }
        .quote-table:not(.quote-table-considered) th:nth-child(3), .quote-table:not(.quote-table-considered) td:nth-child(3) { text-align: center; }
        .quote-table:not(.quote-table-considered) td:nth-child(n+4), .quote-table:not(.quote-table-considered) th:nth-child(n+4) { text-align: right; }
        .quote-table-considered th:nth-child(2), .quote-table-considered td:nth-child(2) { text-align: center; }
        .quote-table-considered th:nth-child(3), .quote-table-considered td:nth-child(3) { text-align: left; }
        .quote-table small { display: block; color: #666; font-size: 9px; margin-top: 2px; }
        .quote-economic { border: 1px solid #d4d4d4; margin-bottom: 6px; }
        .quote-economic-row { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 8px 12px; font-size: 10px; font-weight: 700; color: #141414; background: #ffffff; }
        .quote-economic-row:nth-child(odd) { background: #f2f2f2; }
        .quote-economic-row + .quote-economic-row { border-top: 1px solid #e4e4e4; }
        .quote-economic-total { background: #ea4c00; color: #ffffff; padding: 11px 14px; display: flex; justify-content: space-between; align-items: center; gap: 12px; font-size: 12.5px; font-weight: 800; }
        .quote-economic-total > strong { font-size: 17px; font-weight: 800; }
        .quote-economic-footnote { font-size: 8.5px; color: #666; margin-top: 5px; }
        .quote-closing { display: grid; grid-template-columns: 1fr 1fr; gap: 28px; margin-top: 16px; }
        .quote-notes { padding: 12px; border-radius: 5px; background: #f7f7f6; margin-bottom: 14px; }
        .quote-notes ul { list-style: disc; padding-left: 14px; font-size: 9px; color: #555; }
        .quote-notes li + li { margin-top: 5px; }
        .quote-payment { font-size: 10px; white-space: pre-wrap; overflow-wrap: anywhere; }
        .quote-signature { text-align: center; padding-top: 42px; font-size: 10px; }
        .quote-signature > div { width: 55mm; border-top: 1px solid #bbb; padding-top: 5px; margin: auto; }
        .quote-signature strong { display: block; color: #ea4c00; }
        .quote-footer { border-top: 1px solid #ea4c00; margin-top: 24px; padding-top: 10px; display: flex; justify-content: space-between; gap: 20px; color: #666; font-size: 8px; overflow-wrap: anywhere; }
        .quote-footer strong { color: #1e1e1e; }
        @media print {
          body > *:not(#obratrack-quote-overlay) { display: none !important; }
          #obratrack-quote-overlay { position: static !important; display: block !important; height: auto !important; background: white !important; backdrop-filter: none !important; }
          .quote-toolbar, .quote-download-error { display: none !important; }
          .quote-scroll { overflow: visible !important; padding: 0 !important; }
          .quote-paper { width: 100% !important; min-height: auto !important; padding: 0 !important; margin: 0 !important; box-shadow: none !important; }
          .quote-table thead { display: table-header-group; }
          .quote-table tr, .quote-closing, .quote-footer { break-inside: avoid; }
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          @page { size: A4 portrait; margin: 12mm; }
        }
      `}</style>
      <div className="quote-toolbar">
        {!editing && <>
        {!readOnly && ['admin', 'supervisor'].includes(activeUser?.rol || '') && <button onClick={() => setEditing(true)} className="bg-white/10 hover:bg-white/20" aria-label="Editar cotización"><Pencil size={16} /><span className="hidden sm:inline">Editar</span></button>}
        <button onClick={handleShare} className="bg-[#178743] hover:bg-[#126c35]" aria-label="Compartir resumen por WhatsApp" title="Compartir resumen por WhatsApp"><MessageCircle size={16} /><span className="hidden sm:inline">Compartir resumen</span></button>
        <button onClick={handleDownload} disabled={downloading} className="bg-[#FF6A00] hover:bg-[#E55F00]" aria-label="Descargar PDF">{downloading ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}<span>{downloading ? 'Generando…' : 'Descargar PDF'}</span></button>
        <button onClick={() => window.print()} className="bg-white/10 hover:bg-white/20" aria-label="Imprimir" title="Imprimir"><Printer size={16} /></button>
        </>}
        <button onClick={onClose} className="bg-white/10 hover:bg-white/20" aria-label="Cerrar cotización" title="Cerrar"><X size={18} /></button>
      </div>
      {error && <p role="alert" className="quote-download-error bg-red-50 text-red-800 text-sm py-2 px-4">{error}</p>}
      {notice && <p role="status" className="quote-download-error bg-green-50 text-green-800 text-sm py-2 px-4">{notice}</p>}
      <div className="quote-scroll">
        {editing ? <QuoteEditor id={visibleQuote.id} onCancel={() => setEditing(false)} onSaved={(row) => {
          saveRevision.current += 1; setCurrent(row.cotizacion); setEditing(false); setNotice('Cambios guardados en la cotización.'); onSaved?.(row);
        }} /> :
        <article id="obratrack-cotizacion-pdf" className="quote-paper">
          <header className="quote-header">
            <div className="quote-brand" style={{ width: 'auto', minWidth: '210px', maxWidth: '380px' }}>
              {document.emisor.logoUrl ? (
                <div className="flex items-center gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={document.emisor.logoUrl}
                    alt={document.emisor.empresa || 'Logo empresa'}
                    className="max-h-14 max-w-[190px] w-auto object-contain shrink-0"
                  />
                  <div>
                    {document.emisor.empresa !== 'Emitido con ObraTrack' && (
                      <p className="text-[12px] font-extrabold text-[#1e1e1e] leading-tight">{document.emisor.empresa}</p>
                    )}
                    {document.emisor.rut && (
                      <p className="text-[8px] font-mono text-gray-600 mt-0.5">RUT: {document.emisor.rut}</p>
                    )}
                    <p className="text-[7px] text-gray-500 mt-0.5">{document.emisor.giro || 'CONTROL · COTIZACIONES · COSTOS · PAGOS · AVANCES'}</p>
                  </div>
                </div>
              ) : (
                <>
                  <Logo variant="horizontal" size="md" />
                  <p className="text-[7px] text-gray-500 mt-1">{document.emisor.giro || 'CONTROL · COTIZACIONES · COSTOS · PAGOS · AVANCES'}</p>
                </>
              )}
            </div>
            <div className="quote-heading"><h1>COTIZACIÓN</h1><p><strong><span className="text-[#FF6A00]">N.°</span> {document.folio}</strong></p>{document.fecha && <p>FECHA: <strong>{document.fecha}</strong></p>}<p>VÁLIDA HASTA: <strong>{document.validez}</strong></p></div>
          </header>
          <div className="quote-info">
            <section><h2 className="quote-section-title"><User />CLIENTE</h2><dl>{fields([['Nombre:', document.cliente.nombre], ['Contacto:', document.cliente.contacto], ['Email:', document.cliente.email], ['Teléfono:', document.cliente.telefono]])}</dl></section>
            <section><h2 className="quote-section-title"><Briefcase />PROYECTO</h2><dl>{fields([['Proyecto:', document.proyecto.nombre], ['Ubicación:', document.proyecto.ubicacion], ['Descripción:', document.proyecto.descripcion]])}</dl></section>
          </div>
          {(() => {
            const hasPartidas = document.partidasSeccion.length > 0;
            const hasMateriales = document.materialesSeccion.length > 0;
            const hasConsidered = document.materialesConsiderados.length > 0;
            const ivaSuffix = document.ivaIncluidoEnPartidas ? ' · IVA incluido' : ' · Valores netos';
            const renderBanner = (title: string) => (
              <div className="quote-section-banner">
                <span className="quote-section-badge" aria-hidden="true"><span /><span /></span>
                <span className="quote-section-heading">{title}</span>
                <span className="quote-section-line" aria-hidden="true" />
              </div>
            );
            const pricedSections = [
              {
                key: 'partidas',
                ariaLabel: `${hasMateriales || hasConsidered ? '1. ' : ''}Partidas / Trabajos`,
                bannerTitle: `${hasMateriales || hasConsidered ? '1. ' : ''}Partidas / Trabajos${ivaSuffix}`,
                colTitle: 'Partida / Trabajo',
                items: document.partidasSeccion,
                amountLabel: document.ivaIncluidoEnPartidas ? 'TOTAL (IVA INCL.)' : 'TOTAL',
                worksNote: !document.ivaIncluidoEnPartidas &&
                  document.trabajosIncluidos.length > 0 &&
                  document.partidasSeccion.every((item) =>
                    /^(?:Mano de obra:|Gastos generales$|Provisi[oó]n de imprevistos$|Margen sobre venta$|Utilidad$)/.test(item.nombre),
                  )
                  ? document.trabajosIncluidos.map((t) => `${t.nombre} (${t.dias} d)`).join(' · ')
                  : '',
              },
              {
                key: 'materiales',
                ariaLabel: `${hasPartidas ? '2. ' : ''}Materiales${document.materialesEsReferencia ? ' incluidos · referencia neta' : ''}`,
                bannerTitle: document.materialesEsReferencia
                  ? `${hasPartidas ? '2. ' : ''}Materiales incluidos · referencia neta`
                  : `${hasPartidas ? '2. ' : ''}Materiales${ivaSuffix}`,
                colTitle: document.materialesEsReferencia ? 'Materiales incluidos · referencia neta' : 'Material',
                items: document.materialesSeccion,
                amountLabel: document.materialesEsReferencia ? 'Importe ref.' : document.ivaIncluidoEnPartidas ? 'TOTAL (IVA INCL.)' : 'TOTAL',
                worksNote: '',
              },
            ].filter((group) => group.items.length > 0);

            return (
              <>
                {pricedSections.map(({ key, ariaLabel, bannerTitle, colTitle, items, amountLabel, worksNote }) => (
                  <div key={key}>
                    {renderBanner(bannerTitle)}
                    {worksNote && <p className="text-[9px] text-gray-600 mb-1.5">Trabajos / fases: {worksNote}</p>}
                    <table className="quote-table !mt-0" aria-label={ariaLabel}>
                      <colgroup><col style={{ width: '6%' }} /><col style={{ width: '43%' }} /><col style={{ width: '7.5%' }} /><col style={{ width: '8%' }} /><col style={{ width: '17%' }} /><col style={{ width: '18.5%' }} /></colgroup>
                      <thead><tr>{['N°', colTitle, 'UNIDAD', 'CANT.', 'PRECIO UNIT.', amountLabel].map((label) => <th key={label} scope="col">{label}</th>)}</tr></thead>
                      <tbody>{items.map((item, index) => <tr key={index}><td>{index + 1}</td><td><strong>{item.nombre}</strong>{item.descripcion && <small>{item.descripcion}</small>}</td><td>{item.precioUnit === null && item.unidad === 'gl' ? '' : item.unidad}</td><td>{item.precioUnit === null && item.unidad === 'gl' ? '' : item.cantidad.toLocaleString('es-CL', { maximumFractionDigits: 6 })}</td><td>{item.precioUnit === null ? '—' : quoteMoney(item.precioUnit)}</td><td><strong>{quoteMoney(item.total)}</strong></td></tr>)}</tbody>
                    </table>
                  </div>
                ))}
                {hasConsidered && (
                  <div>
                    {renderBanner('Materiales considerados')}
                    <table className="quote-table quote-table-considered !mt-0" aria-label="Materiales considerados">
                      <colgroup><col style={{ width: '7%' }} /><col style={{ width: '15%' }} /><col style={{ width: '78%' }} /></colgroup>
                      <thead><tr><th scope="col">N°</th><th scope="col">CANT.</th><th scope="col">MATERIAL / INSUMO</th></tr></thead>
                      <tbody>
                        {document.materialesConsiderados.map((mat, index) => (
                          <tr key={`${mat.nombre}-${index}`}>
                            <td>{index + 1}</td>
                            <td>{mat.cantidadTexto}</td>
                            <td>{mat.nombre}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <div>
                  {renderBanner('Resumen económico')}
                  {document.resumenEconomico.length > 0 && (
                    <div className="quote-economic">
                      {document.resumenEconomico.map((row) => (
                        <div key={row.label} className="quote-economic-row">
                          <span>{row.label}</span>
                          <span>{quoteMoney(row.amount)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="quote-economic-total">
                    <span>TOTAL GENERAL DEL PROYECTO</span>
                    <strong>{quoteMoney(document.total)}</strong>
                  </div>
                  <p className="quote-economic-footnote">
                    {document.ivaIncluidoEnPartidas
                      ? 'Valores expresados en pesos chilenos (CLP) · IVA incluido.'
                      : 'Valores expresados en pesos chilenos (CLP).'}
                  </p>
                </div>
              </>
            );
          })()}
          <div className="quote-closing">
            <div><section className="quote-notes"><h2 className="quote-section-title"><FileText />OBSERVACIONES</h2><ul>{document.observaciones.map((note) => <li key={note}>{note}</li>)}</ul></section><section><h2 className="quote-section-title"><DollarSign />CONDICIONES DE PAGO</h2><p className="quote-payment">{document.condiciones}</p></section></div>
            <div><div className="quote-signature"><div>Firma y sello<strong>{document.emisor.firma || 'ObraTrack'}</strong></div></div></div>
          </div>
          <footer className="quote-footer">
            <div>
              <strong>{document.emisor.empresa}{document.emisor.rut ? ` · RUT: ${document.emisor.rut}` : ''}</strong>
              <p>{[document.emisor.nombre, document.emisor.cargo].filter(Boolean).join(' — ')}</p>
              {document.emisor.direccion && <p>{document.emisor.direccion}</p>}
            </div>
            <div className="text-right">
              {document.emisor.email && <p>{document.emisor.email}</p>}
              {document.emisor.telefono && <p>{document.emisor.telefono}</p>}
              {document.emisor.sitioWeb && <p>{document.emisor.sitioWeb}</p>}
            </div>
          </footer>
        </article>
        }
      </div>
    </ModalOverlay>
  );
}
