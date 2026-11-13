require('./helpers/typescript.cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { isolatedState } = require('../lib/whatsapp/state.ts');
const { convertirPresupuestoEnObra } = require('../lib/presupuestos-to-obra.ts');
const { normalizeQuote } = require('../lib/ai/protocol.ts');
const { calcularEstadoPago } = require('../lib/edp-calculator.ts');
const { storedFile, signStoredFile } = require('../lib/supabase/private-files.ts');
const { supabaseUrl } = require('../lib/supabase/client.ts');
const owner = { id: 'owner', empresa_id: 'company', rol: 'admin', nombre: 'Contratista' };
test('convertir respeta materiales fraccionarios, correo, plazo y ubicación desconocida sin inventar coordenadas', () => {
  const s = isolatedState(owner, { usuarios: [owner] }, 'pro_ia');
  const quote = normalizeQuote({ titulo_proyecto: 'Reparación', cliente_nombre: 'Cliente', cliente_email: 'cliente@example.test', comuna_region: 'Lugar por confirmar', duracion_dias_estimada: 2, materiales: [{ nombre: 'Hormigón', unidad: 'm3', cantidad: .5, precio_unitario_estimado: 100000 }], mano_de_obra: [] });
  const result = s.runLocalAI(() => convertirPresupuestoEnObra(quote, { service: s, fechaInicio: '2026-11-02' }));
  assert.equal(s.getMaterialesProyecto(result.proyecto.id)[0].cantidad, .5);
  assert.equal(result.cliente.email, 'cliente@example.test');
  assert.equal(result.proyecto.fecha_termino_estimada, '2026-11-04');
  assert.equal(result.proyecto.latitud, undefined);
});
test('la región no sustituye la comuna elegida al convertir una cotización', () => {
  const s = isolatedState(owner, { usuarios: [owner] }, 'pro_ia');
  const q = normalizeQuote({titulo_proyecto:'Obra Maipú',comuna_region:'Maipu, Región Metropolitana de Santiago',materiales:[{nombre:'Material',cantidad:1,precio_unitario_estimado:1000}],mano_de_obra:[]});
  const result = s.runLocalAI(() => convertirPresupuestoEnObra(q,{service:s}));
  assert.equal(result.proyecto.comuna,'Maipú');
});
test('pagos pendientes y anulados no reducen la deuda en el resumen ni en un estado de pago', () => {
  const p = { id: 'p', empresa_id: 'company', nombre: 'Obra', estado: 'activo', monto_cotizado: 1000000, fecha_inicio: '2026-11-01', fecha_termino_estimada: '2026-12-01' };
  const payments = [ { id: 'a', proyecto_id: 'p', monto: 100000, estado: 'completado' }, { id: 'b', proyecto_id: 'p', monto: 300000, estado: 'pendiente' }, { id: 'c', proyecto_id: 'p', monto: 400000, estado: 'anulado' } ];
  const service = isolatedState(owner, { usuarios: [owner], proyectos: [p], pagos: payments }, 'pro_ia');
  assert.equal(service.getProyectoById('p').total_pagado, 100000);
  const edp = calcularEstadoPago({ proyecto: p, pagos: [...payments, { id: 'foreign', proyecto_id: 'other', monto: 999999 }], actividades: [] });
  assert.equal(edp.totalPagadoAnterior, 100000);
  assert.equal(edp.cobroSugeridoSegunAvance, 0);
  assert.equal(edp.liquidoAPagarConIva, 0);
  assert.equal(calcularEstadoPago({ proyecto: p, pagos: payments, montoPersonalizadoConIva: 200000 }).liquidoAPagarConIva, 200000);
});
test('un enlace privado se renueva solo dentro de la empresa y sus obras autorizadas', async () => {
  const url = supabaseUrl + '/storage/v1/object/public/documentos-obra/company/project/contrato.pdf';
  let signed = 0;
  const client = { storage: { from: () => ({ createSignedUrl: async (path) => { signed++; assert.equal(path, 'company/project/contrato.pdf'); return { data: { signedUrl: 'https://example.test/temporary-file' }, error: null }; } }) } };
  assert.deepEqual(storedFile(url), { bucket: 'documentos-obra', path: 'company/project/contrato.pdf' });
  assert.equal(storedFile('https://evil.test/storage/v1/object/public/documentos-obra/company/project/contrato.pdf'), null);
  assert.equal(await signStoredFile(url, 'other', new Set(['project']), client), null);
  assert.equal(await signStoredFile(url, 'company', new Set(['unassigned']), client), null);
  assert.equal(signed, 0);
  assert.equal(await signStoredFile(url, 'company', new Set(['project']), client), 'https://example.test/temporary-file');
  assert.equal(signed, 1);
});

test('recepciones renuevan fotos privadas al leer el acta y descartan referencias de otras obras sin mutar el historial',async()=>{
 const {signRows}=require('../lib/supabase/private-files.ts');
 const base=supabaseUrl+'/storage/v1/object/sign/bitacora-fotos/';
 const original={id:'acta',proyecto_id:'project',recepcion_resumen:{estado:'conforme',fotos:[base+'company/project/acta-photo.jpg?token=expired',base+'other-company/project/foreign.jpg?token=expired']}};
 const client={storage:{from:()=>({createSignedUrl:async path=>({data:{signedUrl:'https://signed.example.test/'+path},error:null})})}};
 const [signed]=await signRows([original],['archivo_url'],'company',new Set(['project']),client);
 assert.deepEqual(signed.recepcion_resumen.fotos,['https://signed.example.test/company/project/acta-photo.jpg']);assert.equal(original.recepcion_resumen.fotos.length,2);assert.match(original.recepcion_resumen.fotos[0],/expired/);
});
