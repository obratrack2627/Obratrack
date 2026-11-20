require('./helpers/typescript.cjs');
const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { generateAI, getAIProvider, isAIConfigured } = require('../lib/ai/provider.ts');
const { generateOpenAI } = require('../lib/ai/openai-provider.ts');
const { strictOutputSchema, restoreOptionalFields } = require('../lib/ai/strict-schema.ts');
const { CHAT_RESPONSE_SCHEMA, QUOTE_RESPONSE_SCHEMA, WHATSAPP_RESPONSE_SCHEMA, MATERIAL_QUERY_SCHEMA } = require('../lib/ai/schema.ts');
const { parseChatResponse } = require('../lib/ai/protocol.ts');
const { transcriptionFile } = require('../lib/ai/audio.ts');
const original = {...process.env};
const keys=['AI_PROVIDER','AI_FALLBACK_PROVIDER','OPENAI_API_KEY','OPENAI_MODEL','OPENAI_REASONING_EFFORT','OPENAI_MODEL_COMPLEX','OPENAI_REASONING_COMPLEX','OPENAI_TRANSCRIPTION_MODEL','GEMINI_API_KEY'];
beforeEach(()=>{for(const k of keys)delete process.env[k];process.env.OPENAI_API_KEY='fixture-openai';process.env.AI_PROVIDER='openai';});
afterEach(()=>{for(const k of keys){if(original[k]===undefined)delete process.env[k];else process.env[k]=original[k];}});
const response=(text,extra={})=>new Response(JSON.stringify({status:'completed',output:[{type:'reasoning',summary:[]},{type:'message',content:[{type:'output_text',text}]}],...extra}),{headers:{'Content-Type':'application/json'}});
const verifySchema=(s)=>{if(s.properties){assert.equal(s.additionalProperties,false);assert.deepEqual(s.required,Object.keys(s.properties));for(const p of Object.values(s.properties))verifySchema(p);}if(s.items)verifySchema(s.items);for(const p of s.anyOf||[])verifySchema(p);};

test('chat y cotizador indican la política sin topes diarios aunque el historial contenga una negativa antigua',()=>{
 const {chatGenerationRequest}=require('../lib/gemini.ts');
 const history=[{rol:'model',texto:'Se alcanzó el límite diario. Espera hasta mañana.'}];
 for(const message of ['¿Puedes asignar personas?','Cotiza un radier de 20 m2 en Maipú']){
  const request=chatGenerationRequest(history,message,{});assert.match(request.options.instructions,/No hay topes diarios internos/);assert.match(request.options.instructions,/no implica saldo ilimitado/);
 }
});

test('los cuatro contratos estrictos conservan campos requeridos y convierten opcionales a null sin mutar el original',()=>{
  for(const source of [CHAT_RESPONSE_SCHEMA,QUOTE_RESPONSE_SCHEMA,WHATSAPP_RESPONSE_SCHEMA,MATERIAL_QUERY_SCHEMA]){
    const saved=JSON.stringify(source);verifySchema(strictOutputSchema(source));assert.equal(JSON.stringify(source),saved);
  }
  const cleaned=restoreOptionalFields({respuesta:'Lista',acciones:[{tipo:'registrar_pago',monto:100,proyecto_id:'p1',dias:null,fecha:null}],cotizacion:null,busqueda_materiales:null},CHAT_RESPONSE_SCHEMA);
  assert.deepEqual(cleaned,{respuesta:'Lista',acciones:[{tipo:'registrar_pago',monto:100,proyecto_id:'p1'}],cotizacion:null});
  assert.equal(parseChatResponse(JSON.stringify(cleaned)).accion.monto,100);
});

test('texto e imagen usan Responses con esquema, credencial solo en servidor y sin almacenar conversaciones',async()=>{
  const result=await generateOpenAI('Consulta sobre foto',{schema:CHAT_RESPONSE_SCHEMA,image:{mimeType:'image/png',data:'aGVsbG8='},fetcher:async(url,opts)=>{
    assert.equal(url,'https://api.openai.com/v1/responses');assert.equal(opts.headers.Authorization,'Bearer fixture-openai');
    const body=JSON.parse(opts.body);assert.equal(body.store,false);assert.equal(body.model,'gpt-6-luna');assert.equal(body.reasoning.effort,'medium');assert.ok(opts.signal);
    assert.equal(body.text.format.strict,true);verifySchema(body.text.format.schema);
    assert.deepEqual(body.input[0].content[1],{type:'input_image',image_url:'data:image/png;base64,aGVsbG8=',detail:'auto'});
    return response(JSON.stringify({respuesta:'Se ve acopio; indica la obra.',acciones:[],cotizacion:null,busqueda_materiales:null}));
  }});
  assert.deepEqual(JSON.parse(result),{respuesta:'Se ve acopio; indica la obra.',acciones:[],cotizacion:null});
});

test('las alternativas acordadas conservan IVA y precios al pasar por el proveedor nuevo',async()=>{
  const make=(label,variant)=>({titulo_proyecto:'Remodelación',nombre_alternativa:label,modo_presupuesto:'precio_acordado',tratamiento_iva:'incluido',partidas_venta:[{nombre:'Base común',unidad:'gl',cantidad:1,precio_unitario:6871000},{nombre:label,unidad:'gl',cantidad:1,precio_unitario:variant}],materiales:[],mano_de_obra:[],cliente_email:null,estructura_financiera:{gastos_generales_porcentaje:null},duracion_dias_estimada:30});
  const text=await generateOpenAI('Dos alternativas',{schema:QUOTE_RESPONSE_SCHEMA,fetcher:async()=>response(JSON.stringify({respuesta:'Opciones',cotizaciones:[make('Wall panel',1940000),make('Deck WPC',2016000)]}))});
  const result=parseChatResponse(text);assert.equal(result.accion,null);assert.equal(result.cotizacion.estructura_financiera.precio_total_con_iva,8811000);assert.equal(result.cotizacion.alternativas[0].estructura_financiera.precio_total_con_iva,8887000);
});

test('cuota, credenciales, cortes y rechazos no publican datos del proveedor ni confirman acciones',async()=>{
  for(const [status,code] of [[429,'AI_RATE_LIMIT'],[400,'AI_CREDENTIALS'],[401,'AI_CREDENTIALS'],[404,'AI_CREDENTIALS'],[503,'AI_UNAVAILABLE']]){
    await assert.rejects(()=>generateOpenAI('Privado',{fetcher:async()=>new Response('OpenAI fixture-openai dato-privado',{status})}),e=>e.code===code&&!/OpenAI|fixture-openai|dato-privado/.test(e.message));
  }
  await assert.rejects(()=>generateOpenAI('X',{fetcher:async()=>response('',{status:'incomplete',incomplete_details:{reason:'max_output_tokens'}})}),e=>e.code==='AI_INCOMPLETE');
  await assert.rejects(()=>generateOpenAI('X',{fetcher:async()=>response('',{output:[{type:'message',content:[{type:'refusal',refusal:'internal'}]}]})}),e=>e.code==='AI_REFUSED');
  await assert.rejects(()=>generateOpenAI('X',{schema:CHAT_RESPONSE_SCHEMA,fetcher:async()=>response('broken-json')}),e=>e.code==='AI_INVALID_RESPONSE');
  await assert.rejects(()=>generateOpenAI('X',{fetcher:async()=>{throw new DOMException('timeout','TimeoutError');}}),e=>e.code==='AI_TIMEOUT');
});

test('no existe fallback aun con variables anteriores ante cuota o indisponibilidad',async()=>{
  process.env.AI_FALLBACK_PROVIDER='gemini';process.env.GEMINI_API_KEY='fixture-gemini';
  for (const [status,code] of [[429,'AI_RATE_LIMIT'],[503,'AI_UNAVAILABLE'],[401,'AI_CREDENTIALS']]) {
    let requests=0;
    await assert.rejects(()=>generateAI('X',{fetcher:async(url)=>{requests++;assert.ok(url.startsWith('https://api.openai.com/'));return new Response('',{status});}}),e=>e.code===code);
    assert.equal(requests,1);
  }
});

test('OpenAI es único proveedor por defecto e ignora variables antiguas sin usar claves Gemini',async()=>{
  delete process.env.AI_PROVIDER;assert.equal(getAIProvider(),'openai');assert.equal(isAIConfigured(),true);
  delete process.env.OPENAI_API_KEY;process.env.GEMINI_API_KEY='fixture-gemini';assert.equal(isAIConfigured(),false);
  process.env.OPENAI_API_KEY='fixture-openai';
  for (const old of ['gemini','unknown']) {
    process.env.AI_PROVIDER=old;assert.equal(getAIProvider(),'openai');
    assert.equal(await generateAI('Hola',{fetcher:async(url)=>{assert.ok(url.includes('api.openai.com'));return response('Hola');}}),'Hola');
  }
});

test('las notas Opus de WhatsApp se convierten en WAV mono de 16 kHz y se transcriben como texto',async()=>{
  const media={mimeType:'audio/ogg',data:fs.readFileSync(__dirname+'/fixtures/voice-tone.ogg').toString('base64')};
  const file=await transcriptionFile(media,Date.now()+10000);const wav=Buffer.from(file.bytes);assert.equal(wav.subarray(0,4).toString(),'RIFF');assert.equal(wav.readUInt32LE(24),16000);assert.equal(wav.readUInt16LE(22),1);assert.ok(wav.length>44);
  const result=await generateOpenAI('Transcribe',{image:media,fetcher:async(url,opts)=>{
    assert.ok(url.endsWith('/audio/transcriptions'));assert.ok(opts.body instanceof FormData);assert.equal(opts.body.get('model'),'gpt-transcribe');assert.equal(opts.headers['Content-Type'],undefined);
    const upload=opts.body.get('file');assert.equal(upload.name,'nota.wav');assert.equal(upload.type,'audio/wav');return new Response(JSON.stringify({text:'Avance de la terraza.'}));
  }});assert.equal(result,'Avance de la terraza.');
  await assert.rejects(()=>transcriptionFile({mimeType:'audio/ogg',data:'aW52YWxpZA=='},Date.now()+10000),e=>e.code==='AI_AUDIO_INVALID');
});

test('los imports históricos tampoco pueden llamar al proveedor anterior',async()=>{
  const {generateGemini,getServerGeminiKey}=require('../lib/ai/gemini-provider.ts');
  process.env.GEMINI_API_KEY='fixture-legacy';process.env.AI_PROVIDER='gemini';
  assert.equal(getServerGeminiKey(),'fixture-openai');
  assert.equal(await generateGemini('Hola',{fetcher:async(url)=>{assert.equal(url,'https://api.openai.com/v1/responses');return response('Hola');}}),'Hola');
});

test('audio vacío desde transcripción OpenAI devuelve error 422 amigable y limpia ruido STT', async () => {
  const media = { mimeType: 'audio/ogg', data: fs.readFileSync(__dirname + '/fixtures/voice-tone.ogg').toString('base64') };
  await assert.rejects(
    () => generateOpenAI('Transcribe', {
      image: media,
      fetcher: async () => new Response(JSON.stringify({ text: '   ' }), { status: 200 }),
    }),
    (error) => error.code === 'AI_EMPTY' && error.status === 422,
  );
  const { sanitizeSttNoiseTranscript } = require('../lib/whatsapp/burst.ts');
  assert.equal(sanitizeSttNoiseTranscript('Subtítulos realizados por la comunidad de Amara.org'), '');
  assert.equal(sanitizeSttNoiseTranscript('Avanzamos el radier al 80%'), 'Avanzamos el radier al 80%');
});

test('enrutamiento híbrido usa gpt-6-luna en medium por defecto y escala a modelo/razonamiento complejo en cotizaciones, Gantt, fotos y reintentos', async () => {
  const { selectAIProfile } = require('../lib/ai/model-router.ts');
  const { chatGenerationRequest } = require('../lib/gemini.ts');
  const { generateValidatedChat } = require('../lib/ai/generation.ts');
  const { AIError } = require('../lib/ai/errors.ts');

  const simple = selectAIProfile({ mode: 'chat', message: '¿Cuánto falta por cobrar?' });
  assert.deepEqual(simple, { tier: 'standard', model: 'gpt-6-luna', reasoningEffort: 'medium', maxOutputTokens: 8192 });

  const quoteWithoutComplexEnv = selectAIProfile({ mode: 'quote', message: 'Cotiza un radier de 20 m2' });
  assert.deepEqual(quoteWithoutComplexEnv, { tier: 'complex', model: 'gpt-6-luna', reasoningEffort: 'high', maxOutputTokens: 12288 });

  process.env.OPENAI_MODEL_COMPLEX = 'gpt-6.1-sol';
  const reqSimple = chatGenerationRequest([], '¿Cuántas obras activas hay?', {});
  assert.equal(reqSimple.options.model, 'gpt-6-luna');
  assert.equal(reqSimple.options.reasoningEffort, 'medium');

  const reqQuote = chatGenerationRequest([], 'Cotiza un muro perimetral de 15 metros', {});
  assert.equal(reqQuote.options.model, 'gpt-6.1-sol');
  assert.equal(reqQuote.options.reasoningEffort, 'medium');
  assert.equal(reqQuote.options.maxOutputTokens, 12288);

  const reqGantt = chatGenerationRequest([], 'Crea la obra Casa Sur con carta gantt de 4 partidas', {});
  assert.equal(reqGantt.options.model, 'gpt-6.1-sol');

  // generateOpenAI respeta overrides por llamada
  await generateOpenAI('Test override', {
    model: 'gpt-6.1-sol',
    reasoningEffort: 'high',
    maxOutputTokens: 12288,
    fetcher: async (_url, opts) => {
      const body = JSON.parse(opts.body);
      assert.equal(body.model, 'gpt-6.1-sol');
      assert.equal(body.reasoning.effort, 'high');
      assert.equal(body.max_output_tokens, 12288);
      return response(JSON.stringify({ respuesta: 'Ok', acciones: [], cotizacion: null }));
    },
  });

  // Reintento tras error 422 escala automáticamente al perfil complejo
  const seenModels = [];
  const res = await generateValidatedChat(
    'Instrucciones',
    'Anota gasto de cemento',
    {},
    {
      model: 'gpt-6-luna',
      reasoningEffort: 'medium',
      validateResult: () => {
        if (seenModels.length === 1) throw new AIError('AI_INVALID_ACTION', 'Falta obra.', 422);
      },
    },
    async (_prompt, opts) => {
      seenModels.push(opts.model);
      return JSON.stringify({ respuesta: '¿De qué obra?', accion: null, cotizacion: null });
    },
  );
  assert.equal(res.respuesta, '¿De qué obra?');
  assert.deepEqual(seenModels, ['gpt-6-luna', 'gpt-6.1-sol']);
});
