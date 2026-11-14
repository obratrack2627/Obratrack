require("./helpers/typescript.cjs");
const { test, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const provider = require("../lib/ai/provider.ts");
const catalog = require("../lib/materials/catalog.ts");
const { AIError } = require("../lib/ai/errors.ts");
const {
  chatAsesorObrasGemini,
  sugerirMaterialesCambioGemini,
} = require("../lib/gemini.ts");
const savedGenerate = provider.generateAI,
  savedCompare = catalog.compareMaterialPrices;
afterEach(() => {
  provider.generateAI = savedGenerate;
  catalog.compareMaterialPrices = savedCompare;
});
const completion = (extra = {}) =>
  JSON.stringify({
    respuesta: "Preparada",
    acciones: [],
    cotizacion: null,
    ...extra,
  });
const quote = {
  titulo_proyecto: "Adicional",
  resumen_ejecutivo: "Trabajo adicional indicado",
  duracion_dias_estimada: 3,
  materiales: [
    {
      nombre: "Material",
      cantidad: 2,
      unidad: "un",
      precio_unitario_estimado: 1000,
    },
  ],
  mano_de_obra: [
    {
      rol: "Maestro",
      cantidad_personas: 1,
      dias_estimados: 1,
      valor_jornal_diario: 5000,
    },
  ],
  estructura_financiera: {
    gastos_generales_porcentaje: 10,
    imprevistos_porcentaje: 5,
    margen_utilidad_porcentaje: 20,
    precio_total_con_iva: 1,
  },
};

test("un fallo de Gemini en materiales adicionales produce un error, sin lista ni montos de reemplazo", async () => {
  provider.generateAI = async () => {
    throw new AIError("AI_RATE_LIMIT", "Cuota agotada", 429);
  };
  await assert.rejects(
    () =>
      sugerirMaterialesCambioGemini({
        titulo: "Muro",
        descripcion: "Adicional",
      }),
    (e) => e.code === "AI_RATE_LIMIT",
  );
});
test("los adicionales incompletos piden medidas y el monto del adicional se recalcula desde el desglose", async () => {
  provider.generateAI = async () =>
    completion({ respuesta: "¿Qué largo y alto tiene el muro?" });
  const missing = await sugerirMaterialesCambioGemini({
    titulo: "Muro",
    descripcion: "Adicional",
  });
  assert.equal(missing.requiere_datos, true);
  assert.deepEqual(missing.materiales, []);
  assert.equal(missing.impacto_monto_sugerido, 0);
  provider.generateAI = async () => completion({ cotizacion: quote });
  const result = await sugerirMaterialesCambioGemini({
    titulo: "Muro",
    descripcion: "Con medidas",
  });
  assert.equal(result.impacto_monto_sugerido, 11495);
  assert.equal(result.impacto_dias_sugerido, 3);
});
test("el texto de la cotización utiliza los totales calculados por el servidor", async () => {
  provider.generateAI = async () =>
    completion({ respuesta: "Total inventado: $999999999", cotizacion: quote });
  const result = await chatAsesorObrasGemini([], "Cotiza un adicional");
  assert.match(result.respuesta, /11\.495/);
  assert.doesNotMatch(result.respuesta, /999999999/);
});
test("buscar un precio activa el catálogo sin ejecutar escrituras ni guardar un presupuesto ficticio", async () => {
  provider.generateAI = async () =>
    completion({
      busqueda_materiales: { producto: "cemento", presentacion: "25kg" },
    });
  let query;
  catalog.compareMaterialPrices = async (q) => {
    query = q;
    return {
      consulta: q,
      consultado_en: new Date().toISOString(),
      resumen: "Sin resultados",
      ofertas: [],
      proveedores: [],
      mejores_ids: [],
    };
  };
  const result = await chatAsesorObrasGemini(
    [],
    "Busca mejor precio de cemento 25kg",
  );
  assert.equal(query.producto, "cemento");
  assert.equal(result.accion, null);
  assert.equal(result.cotizacion, null);
  assert.ok(result.comparacion_materiales);
});
test("una respuesta sin catálogo no puede presentar una estimación como búsqueda de precios", async () => {
  provider.generateAI = async () =>
    completion({ respuesta: "El mejor precio es $1000", cotizacion: quote });
  const result = await chatAsesorObrasGemini(
    [],
    "Busca el mejor precio de cemento",
  );
  assert.equal(result.cotizacion, null);
  assert.equal(result.accion, null);
  assert.doesNotMatch(result.respuesta, /\$1000/);
  assert.match(result.respuesta, /material|herramienta/);
});
test("la revisión de una cotización conserva el contexto y usa el flujo de presupuestos", async () => {
  let prompt, instructions;
  provider.generateAI = async (p, options) => {
    prompt = p;
    instructions = options.instructions;
    return completion({ cotizacion: quote });
  };
  await chatAsesorObrasGemini([], "Cambia la utilidad al 20%", {
    cotizacion_actual: {
      titulo_proyecto: "Presupuesto previo",
      materiales: [{ nombre: "Material previo" }],
    },
  });
  assert.match(prompt, /Presupuesto previo/);
  assert.match(prompt, /Material previo/);
  assert.match(instructions, /modificar un presupuesto previo/);
  assert.doesNotMatch(instructions, /Presupuesto previo|Material previo/);
});

test('cotizar con antecedentes admite más tiempo sin superar el límite total y las fotos conservan el presupuesto del canal',async()=>{
 const budgets=[];
 provider.generateAI=async(p,opts)=>{budgets.push({budget:opts.budgetMs,timeout:opts.timeoutMs});return completion({cotizacion:quote});};
 await chatAsesorObrasGemini([],'Cotiza un radier');
 await chatAsesorObrasGemini([],'Cotiza un radier',{}, {budgetMs:30000,timeoutMs:20000,image:{mimeType:'image/png',data:'fixture'}});
 await chatAsesorObrasGemini([],'¿Cómo va mi obra?',{}, {budgetMs:45000,timeoutMs:40000});
 const maxima=[{budget:45000,timeout:40000},{budget:30000,timeout:20000},{budget:30000,timeout:30000}];
 for(const [i,limits] of budgets.entries()){assert.ok(limits.budget>0 && limits.budget<=maxima[i].budget);assert.ok(limits.timeout>0 && limits.timeout<=maxima[i].timeout);}
});
