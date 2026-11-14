const {test}=require('node:test');const assert=require('node:assert/strict');const {curate}=require('../scripts/lib/obrabot-curation.cjs');
const base={reviewed:true,anonymized:true,consent:true,source:'success',role:'admin',plan:'pro_ia',market_prices:false,arithmetic:false,message:'Crea Entidad 1 por 600000',context:{proyectos:[],clientes:[],usuarios:[],actividades:[]},response:{respuesta:'Voy a preparar la obra.',acciones:[{tipo:'crear_proyecto',nombre:'Entidad 1',monto_cotizado:600000}],cotizacion:null}};
test('SFT deduplica y separa conjuntos sin entrenar cálculos',()=>{
 const out=curate([base,base]);assert.equal(out.train.length+out.validation.length,1);assert.equal(out.rejected.length,0);
 const again=curate([base]);assert.deepEqual(out,again);
});
test('SFT rechaza falta de revisión, contactos, retail y montos no dados por el usuario',()=>{
 const rows=[{...base,reviewed:false},{...base,message:'Crea para juan@example.test'},{...base,response:{...base.response,cotizacion:{precio_total_con_iva:600000}}},{...base,response:{...base.response,acciones:[{tipo:'crear_proyecto',nombre:'Entidad 1',monto_cotizado:714000}]}},{...base,role:'terreno'}];
 const out=curate(rows);assert.equal(out.rejected.length,rows.length);assert.equal(out.train.length+out.validation.length,0);
});

test('el exportador Golden tampoco incorpora estimaciones, retail ni totales derivados',()=>{
 const {sftEligibleCase}=require('../scripts/export-obrabot-sft.cjs');
 assert.equal(sftEligibleCase({role:'admin',plan:'pro_ia',message:'Cotiza radier',response:{cotizaciones:[{materiales:[{precio_unitario_estimado:5000}]}]}}),false);
 assert.equal(sftEligibleCase({role:'admin',plan:'pro_ia',message:'Crea con esa cotización',context:{cotizacion_actual:{}},response:{acciones:[{tipo:'crear_proyecto',nombre:'Entidad 1',monto_cotizado:714000}]}}),false);
});

test('el contexto SFT elimina precios históricos y no incluye ejemplos de aritmética en instructions',()=>{
 const {trainingContext,TOOL_ONLY_INSTRUCTIONS}=require('../scripts/lib/obrabot-sft-policy.cjs');
 const context=trainingContext({proyectos:[{id:'anon-p',nombre:'Entidad 1',monto_cotizado:1234567}],cotizacion_actual:{precio_total_con_iva:1234567}});
 assert.equal(JSON.stringify(context).includes('1234567'),false);assert.equal(/precio_unitario_estimado|valor_jornal_diario/.test(TOOL_ONLY_INSTRUCTIONS),false);
});

test('deduplicar SFT no depende del orden de las propiedades JSON',()=>{
 const reordered={...base,response:{cotizacion:null,acciones:base.response.acciones,respuesta:'Otro texto de presentación'},context:{usuarios:[],clientes:[],proyectos:[],actividades:[]}};
 const result=curate([base,reordered]);assert.equal(result.train.length+result.validation.length,1);
});
