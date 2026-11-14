require('./helpers/typescript.cjs');
const {test,afterEach}=require('node:test');const assert=require('node:assert/strict');
const {createDailyClosePDF,dailyCloseFilename}=require('../lib/daily-close-pdf.ts');
const {dailyCloseDocument}=require('../lib/whatsapp/daily-close-document.ts');
const {sendMetaDocument}=require('../lib/whatsapp/meta.ts');
const {dailyCloseWhatsApp}=require('../lib/whatsapp/format.ts');
const summary={version:2,fecha:'2026-11-13',proyecto_nombre:'Ampliación Maipú',confirmado_por:'Jefe de obra',confirmado_en:'2026-11-14T00:00:00Z',presentes:1,horas:8,personas:[{nombre:'Felipe',estado:'presente',horas:8}],avances:[],recepciones:[],ingresos:100000,gastos:20000,mano_obra:0,pendientes:['Revisar cubierta'],tareas_manana:['Sellar'],nota:'Revision guardada'};
const receipt={persistido:true,actor_id:'boss',empresa_id:'company',acciones:{tipo:'registrar_documento',detalles:{id:'close',categoria:'cierre_diario',proyecto_id:'project',cierre_resumen:summary}}};
const originalFetch=global.fetch;const env={...process.env};
afterEach(()=>{global.fetch=originalFetch;for(const key of Object.keys(process.env))if(!(key in env))delete process.env[key];Object.assign(process.env,env);});
function database(role='supervisor',assigned=true){
 const rows={usuarios:[{id:'boss',empresa_id:'company',rol:role,telefono_whatsapp:'+56912345678'}],documentos_obra:[{id:'close',empresa_id:'company',proyecto_id:'project',categoria:'cierre_diario',cierre_resumen:summary}],proyecto_trabajadores:assigned?[{proyecto_id:'project',usuario_id:'boss'}]:[]};
 return {from(table){const predicates=[];const q={select(){return q},eq(k,v){predicates.push(row=>row[k]===v);return q},maybeSingle(){return q},then(resolve,reject){return Promise.resolve({data:(rows[table]||[]).find(row=>predicates.every(test=>test(row)))||null}).then(resolve,reject)}};return q;}};
}
test('el PDF conserva el detalle completo, genera páginas numeradas y un nombre identificable',async()=>{
 const long={...summary,avances:Array.from({length:30},(_,i)=>({titulo:'Registro '+i,nota:'Detalle de terreno. '.repeat(30)+(i===29?'ULTIMO_REGISTRO':'')}))};
 const pdf=await createDailyClosePDF(long);const text=pdf.output();
 assert.ok(pdf.getNumberOfPages()>1);assert.ok(text.includes('ULTIMO_REGISTRO'));assert.ok(text.includes('Pagina 1 de'));
 assert.ok(Buffer.from(pdf.output('arraybuffer')).subarray(0,5).toString()==='%PDF-');assert.equal(dailyCloseFilename(summary),'ObraTrack_cierre_Ampliacion_Maipu_2026-11-13_r2.pdf');
});
test('el cierre de WhatsApp lleva a su resumen específico con opción de PDF',()=>{
 const text=dailyCloseWhatsApp(receipt.acciones);assert.match(text,/\*Cierre de jornada guardado\*/);assert.match(text,/documentos\?documento=close/);assert.match(text,/descargar PDF/);
});
test('PDF de WhatsApp usa el cierre guardado y solo llega al teléfono y jefe asignados',async()=>{
 assert.ok((await dailyCloseDocument(database(),receipt,'56912345678')).bytes.byteLength>100);
 for(const [db,phone] of [[database('terreno'),'56912345678'],[database('supervisor',false),'56912345678'],[database(),'56999999999']])await assert.rejects(dailyCloseDocument(db,receipt,phone),e=>e.code==='DAILY_CLOSE_FORBIDDEN');
 assert.equal(await dailyCloseDocument(database(),{persistido:false},'56912345678'),null);
});
test('Meta recibe un PDF privado por ID de medio, sin crear enlaces públicos',async()=>{
 process.env.WHATSAPP_CLOUD_API_ACCESS_TOKEN='fixture';process.env.WHATSAPP_CLOUD_API_PHONE_NUMBER_ID='123';
 let calls=0;global.fetch=async(url,init)=>{calls++;if(calls===1){assert.match(String(url),/\/123\/media$/);assert.equal(init.body.get('file').type,'application/pdf');assert.equal(init.body.get('file').name,'cierre.pdf');return new Response(JSON.stringify({id:'456'}),{status:200});}const body=JSON.parse(init.body);assert.equal(body.type,'document');assert.deepEqual(body.document,{id:'456',filename:'cierre.pdf',caption:'Cierre confirmado'});assert.equal(body.to,'56912345678');return new Response('{}',{status:200});};
 await sendMetaDocument('+56912345678',new TextEncoder().encode('%PDF-fixture').buffer,'cierre.pdf','Cierre confirmado');assert.equal(calls,2);
});
