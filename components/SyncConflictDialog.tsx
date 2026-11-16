'use client';
import { formatCLP } from '@/lib/utils';
import {useState} from 'react';
import ModalOverlay from './ModalOverlay';
import {dataService} from '@/lib/data-service';

const labels:Record<string,string>={cliente_id:'Cliente',usuario_id:'Persona',responsable_id:'Responsable',proyecto_id:'Obra',actividad_id:'Partida',especialidades:'Especialidades',proveedor:'Proveedor',categoria:'Categoría',cantidad_recibida:'Cantidad recibida',dias_laborales:'Días de trabajo',fechas_no_laborales:'Fechas no laborables',archivo_nombre:'Archivo adjunto',nombre:'Nombre',titulo:'Título',descripcion:'Descripción',nota:'Detalle',notas:'Notas',email:'Correo',telefono:'Teléfono',telefono_whatsapp:'WhatsApp',rut:'RUT',estado:'Estado',monto:'Monto',monto_cotizado:'Presupuesto',monto_adicional:'Gasto',cantidad:'Cantidad',unidad:'Unidad',precio_unitario:'Precio unitario',subtotal:'Subtotal',comprado:'Comprado',pagado:'Pagado',fecha:'Fecha',fecha_inicio:'Inicio',fecha_termino:'Término',fecha_termino_estimada:'Término previsto',porcentaje_avance:'Avance (%)',direccion:'Dirección',comuna:'Comuna',region:'Región',trabajadores_ids:'Cuadrilla',trabajador_nombre:'Trabajador',hora_entrada:'Entrada',hora_salida:'Salida',observacion:'Observación'};
function display(value:unknown,key:string){
 if(value==null)return 'Sin informar';
 if(key==='cliente_id')return dataService.getClienteById(String(value))?.nombre||'Cliente no disponible';
 if(['usuario_id','responsable_id'].includes(key))return dataService.getUsuarios().find(row=>row.id===value)?.nombre||'Persona no disponible';
 if(key==='proyecto_id')return dataService.getProyectoById(String(value))?.nombre||'Obra no disponible';
 if(key==='actividad_id')return dataService.getActividades().find(row=>row.id===value)?.nombre||'Partida no disponible';
 if(key==='trabajadores_ids' && Array.isArray(value))return value.map(id=>dataService.getUsuarios().find(row=>row.id===id)?.nombre||'Integrante').join(', ')||'Sin integrantes';
 if(['monto','monto_cotizado','monto_adicional','precio_unitario','subtotal'].includes(key))return formatCLP(Number(value));
 return typeof value==='boolean'?(value?'Sí':'No'):Array.isArray(value)?value.join(', '):String(value);
}

export default function SyncConflictDialog({onClose,onResolved}:{onClose:()=>void;onResolved:()=>void}){
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const rows=dataService.syncConflictRows();
 async function resolve(keep:'local'|'remote'){
  setBusy(true);setError('');
  try{await dataService.resolveSyncConflict(keep);onResolved();onClose();}catch(e){setError(e instanceof Error?e.message:'No se pudo guardar la decisión.');}finally{setBusy(false);}
 }
 return <ModalOverlay role="dialog" aria-modal="true" aria-labelledby="sync-conflict-title" onClose={()=>{if(!busy)onClose();}} className="fixed inset-0 flex items-center justify-center bg-black/50 p-3">
  <div className="flex max-h-[90dvh] w-full max-w-2xl flex-col rounded-2xl border border-kraft-200 bg-white p-4 dark:border-gray-700 dark:bg-[#141A23] sm:p-6">
   <h2 id="sync-conflict-title" className="text-lg font-bold">Revisar cambios pendientes</h2>
   <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">Los datos cambiaron desde tu última actualización. Compara ambas versiones y elige qué conservar. La decisión se aplicará a los registros de esta lista.</p>
   <div className="my-4 space-y-3 overflow-y-auto">
    {rows.map((row,i)=><article key={i} className="rounded-xl border border-kraft-200 p-3 dark:border-gray-700">
     <h3 className="break-words font-semibold">{row.name}</h3>
     {row.deleting?<p className="mt-2 text-sm">Tu cambio pendiente elimina este registro. Conservar la nube cancela esa eliminación.</p>:!row.remote?<p className="mt-2 text-sm">El registro aún no está en la nube o fue eliminado. Guardar tus cambios intentará crearlo nuevamente.</p>:<dl className="mt-2 space-y-2 text-sm">{Object.keys(labels).filter(key=>JSON.stringify(row.local?.[key])!==JSON.stringify(row.remote?.[key]) && (row.local?.[key]!=null||row.remote?.[key]!=null)).map(key=><div key={key}><dt className="font-semibold">{labels[key]}</dt><dd className="mt-1 grid gap-2 sm:grid-cols-2"><p className="break-words rounded-lg bg-orange-50 p-2 text-gray-800 dark:bg-orange-950/30 dark:text-gray-100"><span className="block text-xs font-semibold">Tus cambios</span>{display(row.local?.[key],key)}</p><p className="break-words rounded-lg bg-kraft-50 p-2 dark:bg-gray-800"><span className="block text-xs font-semibold">Guardado en la nube</span>{display(row.remote?.[key],key)}</p></dd></div>)}</dl>}
    </article>)}
   </div>
   {error&&<p role="alert" className="mb-3 text-sm text-red-700 dark:text-red-300">{error}</p>}
   <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
    <button disabled={busy} onClick={()=>void resolve('remote')} className="min-h-11 rounded-xl border border-kraft-300 px-4 py-2 font-semibold disabled:opacity-50 dark:border-gray-600">Conservar datos de la nube</button>
    <button disabled={busy} onClick={()=>void resolve('local')} className="min-h-11 rounded-xl bg-obra-orange px-4 py-2 font-semibold text-white disabled:opacity-50">Guardar mis cambios</button>
    <button disabled={busy} onClick={onClose} className="min-h-11 px-3 py-2 underline disabled:opacity-50">Revisar después</button>
   </div>
  </div>
 </ModalOverlay>;
}
