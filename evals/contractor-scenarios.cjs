require('../tests/helpers/typescript.cjs');
const assert = require('node:assert/strict');

const { isQuoteWorkflow, parseQuoteMessage, tryNaturalQuoteEdit } = require('../lib/obrabot/quotes.ts');
const { applyNaturalQuoteEdit, applyStructuredQuoteEdit } = require('../lib/obrabot/quote-edit-natural.ts');
const { isQuotePdfRequest, isQuoteExcelRequest } = require('../lib/obrabot/whatsapp.ts');
const { appliesQuoteToExistingProject } = require('../lib/whatsapp/quote-intake.ts');
const { personIntake } = require('../lib/whatsapp/person-intake.ts');
const { buildApplyQuoteToProjectPlan, resolveSharedDeterministicTurn } = require('../lib/ai/turn-core.ts');
const { budgetApplication } = require('../lib/quotes/application.ts');
const {
  deriveUnifiedQuoteStage,
  extractWhatsAppQuoteRefs,
  extractWebQuoteRefs,
} = require('../lib/quotes/unified.ts');
const { shouldUseSemanticIntentRouter } = require('../lib/ai/intent-router.ts');
const { normalizeTurnAction } = require('../lib/ai/normalize-turn-action.ts');
const { checkActionPermissions } = require('../lib/ai/permissions.ts');
const { normalizeQuote } = require('../lib/ai/protocol.ts');

const REAL_BATHROOM_PASTE = [
  'Presupuesto remodelación baño Maipú',
  '',
  'Remodelación baño principal trabajos a realizar :',
  '',
  '· demolición de cerámica existente',
  '· red de agua potable y alcantarillado',
  '· instalación de porcelanato piso y muros',
  '· instalación de vanitorio, WC y ducha',
  '· instalación eléctrica y extractor',
  '· empastado y pintado de cielo',
  '· traslado de material',
  '· retiro de escombro',
  '',
  'Total de proyecto $ 1.850.000',
  '',
  'Para dar inicio al proyecto se solicitará el 60% del presupuesto',
  '$ 1.110.000',
  '',
  'Al finalizar el proyecto se solicitará el 40% restante',
  '$ 740.000',
].join('\n');

function baseBathroomQuote() {
  return normalizeQuote({
    titulo_proyecto: 'Presupuesto remodelación baño Maipú',
    modo_presupuesto: 'precio_acordado',
    tratamiento_iva: 'incluido',
    duracion_dias_estimada: 10,
    resumen_ejecutivo: [
      '• demolición de cerámica existente',
      '• red de agua potable y alcantarillado',
      '• instalación de porcelanato piso y muros',
      '• instalación de vanitorio, WC y ducha',
      '• instalación eléctrica y extractor',
      '• empastado y pintado de cielo',
    ].join('\n'),
    partidas_venta: [
      { nombre: 'Remodelación integral baño principal', unidad: 'gl', cantidad: 1, precio_unitario: 0, precio_partida: 1850000, tipo: 'partida' },
    ],
    materiales_considerados: [
      { nombre: 'Porcelanato piso y muros', cantidad: 16, unidad: 'm2' },
      { nombre: 'Pegamento cerámico saco 25 kg', cantidad: 6, unidad: 'saco' },
    ],
    hitos_pago: [
      { nombre: 'Inicio del proyecto', porcentaje: 60 },
      { nombre: 'Al finalizar el proyecto', porcentaje: 40 },
    ],
    materiales: [],
    mano_de_obra: [],
  });
}

function baseMultiLineQuote() {
  return normalizeQuote({
    titulo_proyecto: 'Terraza porcelanato Las Condes',
    modo_presupuesto: 'precio_acordado',
    tratamiento_iva: 'incluido',
    duracion_dias_estimada: 8,
    partidas_venta: [
      { nombre: 'Porcelanato terraza', unidad: 'm2', cantidad: 18, precio_unitario: 25000, tipo: 'material' },
      { nombre: 'Mano de obra instalación', unidad: 'gl', cantidad: 1, precio_unitario: 0, precio_partida: 400000, tipo: 'mano_de_obra' },
      { nombre: 'Pintura cielo', unidad: 'gl', cantidad: 1, precio_unitario: 0, precio_partida: 150000, tipo: 'partida' },
    ],
    materiales: [],
    mano_de_obra: [],
  });
}

const CONTRACTOR_EVAL_SCENARIOS = [
  {
    id: 1,
    name: 'Parsea cotización pegada suma alzada con 8 trabajos e hitos 60/40',
    run: async () => {
      const parsed = await parseQuoteMessage(REAL_BATHROOM_PASTE);
      assert.match(parsed.titulo_proyecto, /Maip[uú]/i);
      assert.equal(parsed.partidas_venta.length, 1);
      assert.equal(parsed.partidas_venta[0].subtotal, 1850000);
      assert.equal(parsed.hitos_pago?.length, 2);
      assert.equal(parsed.hitos_pago?.[0]?.porcentaje, 60);
      assert.equal(parsed.hitos_pago?.[1]?.porcentaje, 40);
      assert.match(parsed.resumen_ejecutivo || '', /demolici[oó]n/i);
    },
  },
  {
    id: 2,
    name: 'Parsea cotización detallada material por material y mano de obra',
    run: async () => {
      const text = [
        'Presupuesto cambio techumbre Puente Alto',
        '30 un zinc acanalado $12.000 c/u',
        '40 un pino dimensionado 2x4 $4.500 c/u',
        'Instalación cubierta maestro $450.000',
      ].join('\n');
      const parsed = await parseQuoteMessage(text);
      assert.equal(parsed.partidas_venta.length, 3);
      const total = parsed.partidas_venta.reduce((acc, r) => acc + r.subtotal, 0);
      assert.equal(total, 30 * 12000 + 40 * 4500 + 450000);
    },
  },
  {
    id: 3,
    name: 'Edición natural en subjuntivo («dejes») conserva alcance e hitos 60/40',
    run: async () => {
      const patch = applyNaturalQuoteEdit(baseBathroomQuote(), 'esta bien pero quiero que dejes el total en 1.800.000');
      assert.ok(patch);
      const normalized = normalizeQuote({ ...baseBathroomQuote(), ...patch });
      assert.equal(normalized.estructura_financiera.precio_total_con_iva, 1800000);
      assert.equal(normalized.hitos_pago?.[0]?.monto, 1080000);
      assert.equal(normalized.hitos_pago?.[1]?.monto, 720000);
      assert.match(normalized.resumen_ejecutivo || '', /porcelanato/i);
    },
  },
  {
    id: 4,
    name: 'Edición estructurada con modismo chileno («bájalo a un palo ochocientos»)',
    run: async () => {
      const patch = applyStructuredQuoteEdit(baseBathroomQuote(), {
        operacion: 'cambiar_total',
        nuevo_monto_clp: 1800000,
      });
      assert.ok(patch);
      assert.equal(patch.partidas_venta[0].subtotal, 1800000);
    },
  },
  {
    id: 5,
    name: 'Edición estructurada oculta fecha en PDF («sácale la fecha al pdf porfa»)',
    run: async () => {
      const patch = applyStructuredQuoteEdit(baseBathroomQuote(), {
        operacion: 'cambiar_fecha',
        mostrar_fecha: false,
        solicita_pdf: true,
      });
      assert.ok(patch);
      assert.equal(patch.mostrar_fecha, false);
    },
  },
  {
    id: 6,
    name: 'Edición natural cambia tratamiento de IVA a valores netos más IVA',
    run: async () => {
      const patch = applyNaturalQuoteEdit(baseBathroomQuote(), 'deja los valores netos más IVA');
      assert.ok(patch);
      assert.equal(patch.tratamiento_iva, 'neto');
      const normalized = normalizeQuote({ ...baseBathroomQuote(), ...patch });
      assert.equal(normalized.estructura_financiera.precio_sugerido_neto, 1850000);
      assert.equal(normalized.estructura_financiera.precio_total_con_iva, 2201500);
    },
  },
  {
    id: 7,
    name: 'Edición natural actualiza plazo a 15 días hábiles',
    run: async () => {
      const patch = applyNaturalQuoteEdit(baseBathroomQuote(), 'cambia el plazo a 15 días hábiles');
      assert.ok(patch);
      assert.equal(patch.duracion_dias_estimada, 15);
      assert.equal(patch.plazo_texto, '15 días hábiles');
    },
  },
  {
    id: 8,
    name: 'Edición natural agrega nueva partida con monto en pesos',
    run: async () => {
      const patch = applyNaturalQuoteEdit(baseMultiLineQuote(), 'agrega retiro de escombros $120.000');
      assert.ok(patch);
      assert.equal(patch.partidas_venta.length, 4);
      assert.ok(patch.partidas_venta.some((l) => /retiro de escombros/i.test(l.nombre) && l.subtotal === 120000));
    },
  },
  {
    id: 9,
    name: 'Edición natural elimina una partida existente por nombre',
    run: async () => {
      const patch = applyNaturalQuoteEdit(baseMultiLineQuote(), 'quita la partida pintura cielo');
      assert.ok(patch);
      assert.equal(patch.partidas_venta.length, 2);
      assert.equal(patch.partidas_venta.some((l) => /pintura cielo/i.test(l.nombre)), false);
    },
  },
  {
    id: 10,
    name: 'Edición natural actualiza superficie en m2 y recalcula subtotal',
    run: async () => {
      const patch = applyNaturalQuoteEdit(baseMultiLineQuote(), 'cambia el porcelanato a 24 m2');
      assert.ok(patch);
      const porc = patch.partidas_venta.find((l) => /porcelanato/i.test(l.nombre));
      assert.equal(porc?.cantidad, 24);
      assert.equal(porc?.subtotal, 24 * 25000);
    },
  },
  {
    id: 11,
    name: 'Atajo directo de descarga PDF reconoce pedidos coloquiales',
    run: async () => {
      assert.equal(isQuotePdfRequest('mándame el pdf'), true);
      assert.equal(isQuotePdfRequest('dámelo en pdf porfa'), true);
      assert.equal(isQuotePdfRequest('hazme una cotización en pdf'), false);
    },
  },
  {
    id: 12,
    name: 'Atajo directo de descarga Excel reconoce pedidos coloquiales',
    run: async () => {
      assert.equal(isQuoteExcelRequest('pásamelo en planilla excel'), true);
      assert.equal(isQuoteExcelRequest('envíame el xlsx porfa'), true);
    },
  },
  {
    id: 13,
    name: 'Reconoce solicitud natural para aplicar cotización a obra existente',
    run: async () => {
      assert.equal(appliesQuoteToExistingProject('agrega también el presupuesto a la obra'), true);
      assert.equal(appliesQuoteToExistingProject('necesito que agregues el presupuesto a la obra'), true);
      assert.equal(appliesQuoteToExistingProject('no agregues el presupuesto a la obra'), false);
    },
  },
  {
    id: 14,
    name: 'Guardia de equipo evita confundir «agrega también el presupuesto a la obra» con un trabajador',
    run: async () => {
      const res = personIntake(
        [],
        null,
        null,
        'agrega tambien el presupuesto a la obra',
        [{ id: 'p1', nombre: 'Remodelación baño Maipú', estado: 'pendiente' }],
        'p1',
        [{ id: 'u1', nombre: 'Felipe Poblete', rol: 'terreno' }],
      );
      assert.equal(res.question, null);
      assert.equal(res.actions.length, 0);
    },
  },
  {
    id: 15,
    name: 'Asignación múltiple de equipo resuelve dos trabajadores chilenos reales',
    run: async () => {
      const res = personIntake(
        [],
        null,
        null,
        'añade a Felipe Poblete y Martin Villalobos como equipo para la obra',
        [{ id: 'p1', nombre: 'Remodelación baño Maipú', estado: 'pendiente' }],
        'p1',
        [
          { id: 'u1', nombre: 'Felipe Poblete', rol: 'terreno' },
          { id: 'u2', nombre: 'Martin Villalobos', rol: 'terreno' },
        ],
      );
      assert.equal(res.question, null);
      assert.equal(res.actions.length, 2);
      assert.equal(res.actions.every((a) => a.tipo === 'asignar_trabajador'), true);
      assert.deepEqual(res.actions.map((a) => a.trabajador_nombre).sort(), ['u1', 'u2']);
    },
  },
  {
    id: 16,
    name: 'Plan compartido buildApplyQuoteToProjectPlan carga Gantt, materiales nuevos y omite duplicados',
    run: async () => {
      const plan = buildApplyQuoteToProjectPlan({
        quote: baseBathroomQuote(),
        project: { id: 'p1', nombre: 'Remodelación baño Maipú', trabajadores_ids: [] },
        existingActivities: [],
        existingMaterials: [{ proyecto_id: 'p1', nombre: 'porcelanato piso y muros' }],
        teamFollowUp: '¿Quieres añadir equipo?',
      });
      assert.equal(plan.addedPartidas, 6);
      assert.equal(plan.addedMaterials, 1);
      assert.equal(plan.needsTeam, true);
      assert.equal(plan.actions.length, 3);
      assert.match(plan.summary, /cargué 6 partidas en la Carta Gantt/);
      assert.match(plan.summary, /agregué 1 materiales/);
    },
  },
  {
    id: 17,
    name: 'Puente budgetApplication genera actividades Gantt y materiales en cotización pactada',
    run: async () => {
      const applied = budgetApplication(
        baseBathroomQuote(),
        {
          id: 'p1',
          empresa_id: 'e1',
          nombre: 'Baño Maipú',
          fecha_inicio: '2026-12-01',
          fecha_termino_estimada: '2026-12-10',
          estado: 'activo',
          monto_cotizado: 1850000,
        },
        [],
        null,
      );
      assert.equal(applied.actividades.length, 6);
      assert.equal(applied.materiales_proyecto.length, 2);
    },
  },
  {
    id: 18,
    name: 'Ciclo de vida unificado clasifica correctamente los 7 estados operativos',
    run: async () => {
      assert.equal(deriveUnifiedQuoteStage({ reviewEstado: 'devuelta' }), 'borrador');
      assert.equal(deriveUnifiedQuoteStage({ reviewEstado: 'pendiente' }), 'pendiente_revision');
      assert.equal(deriveUnifiedQuoteStage({ reviewEstado: 'aprobada', presupuestoEstado: 'aprobada' }), 'aprobada');
      assert.equal(deriveUnifiedQuoteStage({ presupuestoEstado: 'enviada' }), 'enviada');
      assert.equal(deriveUnifiedQuoteStage({ presupuestoEstado: 'rechazada' }), 'rechazada');
      assert.equal(deriveUnifiedQuoteStage({ presupuestoEstado: 'no_elegida' }), 'anulada');
      assert.equal(deriveUnifiedQuoteStage({ presupuestoEstado: 'aprobada', proyectoId: 'p1' }), 'vinculada_a_obra');
    },
  },
  {
    id: 19,
    name: 'Extracción unificada de referencias preserva recencia entre WhatsApp y Web',
    run: async () => {
      const revId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
      const nowIso = new Date().toISOString();
      const waRefs = extractWhatsAppQuoteRefs([
        { message_id: 'm1', created_at: nowIso, cotizacion: { id: 'cot-1' } },
        { message_id: 'm2', created_at: nowIso, acciones: { solicitud_cotizacion: revId } },
      ]);
      assert.deepEqual(waRefs, [
        { kind: 'budget', id: 'cot-1' },
        { kind: 'review', id: revId },
      ]);
      const webRefs = extractWebQuoteRefs([
        { remitente: 'agente', cotizacion_obrabot: { solicitud_cotizacion: revId } },
        { remitente: 'agente', cotizacion: { id: 'cot-web' } },
      ]);
      assert.deepEqual(webRefs, [
        { kind: 'budget', id: 'cot-web' },
        { kind: 'review', id: revId },
      ]);
    },
  },
  {
    id: 20,
    name: 'Edición unificada actualiza presupuesto nativo y protege inmutable obrabot-v2',
    run: async () => {
      const q = baseBathroomQuote();
      const revImm = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
      const store = {
        budgets: [
          { id: 'wa:n1', empresa_id: 'e1', estado: 'aprobada', proyecto_id: null, cotizacion: q },
          { id: `obrabot-v2:${revImm}`, empresa_id: 'e1', estado: 'aprobada', proyecto_id: null, cotizacion: q },
        ],
        reviews: [],
      };
      const db = {
        from(tbl) {
          const filters = [];
          const chain = {
            select() { return this; },
            eq(c, v) { filters.push([c, v]); return this; },
            in() { return this; },
            order() { return this; },
            limit() { return this; },
            async maybeSingle() {
              const src = tbl === 'presupuestos' ? store.budgets : store.reviews;
              const hit = src.find((r) => filters.every(([c, v]) => (c === 'cotizacion->>id' ? r.cotizacion?.id === v : r[c] === v)));
              return { data: hit || null, error: null };
            },
            update(patch) {
              return {
                eq(c1, v1) {
                  filters.push([c1, v1]);
                  return {
                    async eq(c2, v2) {
                      filters.push([c2, v2]);
                      for (const r of store.budgets) {
                        if (filters.every(([c, v]) => r[c] === v)) Object.assign(r, patch);
                      }
                      return { error: null };
                    },
                  };
                },
              };
            },
          };
          return chain;
        },
        async rpc(fn, params) {
          if (fn === 'obrabot_registrar_cotizacion') {
            store.reviews.push({ id: params.p_id, empresa_id: params.p_empresa, estado: 'pendiente', revision: 1, borrador: params.p_borrador, presupuesto_id: null });
          }
          return { data: null, error: null };
        },
      };
      const actor = { id: 'u1', empresa_id: 'e1', rol: 'admin' };
      const r1 = await tryNaturalQuoteEdit(db, actor, 'whatsapp', 'deja el total en 1.800.000', [], true, 'req-1', null, [{ kind: 'budget', id: 'wa:n1' }]);
      assert.equal(r1?.cotizacion?.estructura_financiera.precio_total_con_iva, 1800000);
      const r2 = await tryNaturalQuoteEdit(db, actor, 'whatsapp', 'deja el total en 1.700.000', [], true, 'req-2', null, [{ kind: 'budget', id: `obrabot-v2:${revImm}` }]);
      assert.ok(r2?.solicitud);
      assert.equal(store.reviews.length, 1);
    },
  },
  {
    id: 21,
    name: 'Router semántico habilita modismos con cotización activa y descarta saludos/terreno',
    run: async () => {
      assert.equal(shouldUseSemanticIntentRouter('bájalo a un palo ochocientos', { channel: 'whatsapp', rol: 'admin', hasActiveQuote: true }, true), true);
      assert.equal(shouldUseSemanticIntentRouter('hola', { channel: 'whatsapp', rol: 'admin', hasActiveQuote: true }, true), false);
      assert.equal(shouldUseSemanticIntentRouter('bájalo a un palo', { channel: 'whatsapp', rol: 'terreno', hasActiveQuote: true }, true), false);
    },
  },
  {
    id: 22,
    name: 'Normalizador de acciones convierte imprevisto de $0 a incidente en bitácora',
    run: async () => {
      const normalized = normalizeTurnAction(
        { tipo: 'registrar_imprevisto', proyecto_id: 'p1', monto: 0, descripcion: 'Fuga en matriz de agua' },
        { userRole: 'terreno', rawText: 'Fuga en matriz de agua', activeProjectId: 'p1' },
      );
      assert.equal(normalized.tipo, 'crear_bitacora');
      assert.equal(normalized.tipo_bitacora, 'incidente');
    },
  },
  {
    id: 23,
    name: 'RBAC bloquea acciones administrativas para rol terreno',
    run: async () => {
      assert.throws(
        () => checkActionPermissions({ rol: 'terreno', id: 'u-ter' }, { tipo: 'crear_proyecto', nombre: 'Obra X', monto_cotizado: 1000000 }, 'crea una obra'),
        /permiso|solo|administrador|jefe|crea|terreno/i,
      );
    },
  },
  {
    id: 24,
    name: 'Core determinista compartido resuelve consultas de plazo y cambios de estado',
    run: async () => {
      const projects = [
        { id: 'p1', nombre: 'Baño Maipú', estado: 'activo', fecha_termino_estimada: '2020-01-10', programacion_pendiente: false },
      ];
      const deadlineTurn = await resolveSharedDeterministicTurn({
        db: {},
        user: { id: 'u1', empresa_id: 'e1', rol: 'admin' },
        channel: 'web',
        text: '¿Qué obras están vencidas?',
        projects,
        history: [],
        allowApu: false,
      });
      assert.ok(deadlineTurn.deadlineReply);
      assert.match(deadlineTurn.deadlineReply.respuesta, /Baño Maipú/);

      const statusTurn = await resolveSharedDeterministicTurn({
        db: {},
        user: { id: 'u1', empresa_id: 'e1', rol: 'admin' },
        channel: 'whatsapp',
        text: 'Cambia la obra Baño Maipú a pausado',
        projects,
        activeProjectId: 'p1',
        history: [],
        allowApu: false,
      });
      assert.equal(statusTurn.statusReply?.accion?.tipo, 'actualizar_proyecto');
      assert.equal(statusTurn.statusReply?.accion?.estado, 'pausado');
    },
  },
  {
    id: 25,
    name: 'Replay integral flujo real 22:43–22:57: pegar cotización -> rebajar a $1.800.000 -> aplicar a obra con Gantt y materiales',
    run: async () => {
      // 1. Pegar presupuesto del baño en Maipú
      const parsed = await parseQuoteMessage(REAL_BATHROOM_PASTE);
      const qInitial = normalizeQuote({
        ...parsed,
        modo_presupuesto: 'precio_acordado',
        duracion_dias_estimada: 10,
        materiales: [],
        mano_de_obra: [],
        actividades_gantt: [],
      });
      assert.equal(qInitial.estructura_financiera.precio_total_con_iva, 1850000);

      // 2. Corregir total en subjuntivo manteniendo alcance detallado e hitos 60/40
      const editPatch = applyNaturalQuoteEdit(qInitial, 'esta bien pero quiero que dejes el total en 1.800.000, arregla el pdf');
      assert.ok(editPatch);
      const qEdited = normalizeQuote({ ...qInitial, ...editPatch });
      assert.equal(qEdited.estructura_financiera.precio_total_con_iva, 1800000);
      assert.equal(qEdited.hitos_pago?.[0]?.monto, 1080000);
      assert.equal(qEdited.hitos_pago?.[1]?.monto, 720000);
      assert.match(qEdited.resumen_ejecutivo || '', /retiro de escombro/i);

      // 3. Aplicar cotización editada a la obra ya creada ("agrega también el presupuesto a la obra")
      assert.equal(appliesQuoteToExistingProject('agrega tambien el presupuesto a la obra'), true);
      const applyPlan = buildApplyQuoteToProjectPlan({
        quote: qEdited,
        project: { id: 'proy-maipu', nombre: 'Remodelación baño Maipú', trabajadores_ids: ['u1', 'u2'] },
        existingActivities: [],
        existingMaterials: [],
      });
      assert.equal(applyPlan.montoTotal, 1800000);
      assert.ok(applyPlan.addedPartidas >= 6);
      assert.equal(applyPlan.actions.some((a) => a.tipo === 'actualizar_proyecto' && a.monto_cotizado === 1800000), true);
      assert.equal(applyPlan.actions.some((a) => a.tipo === 'crear_actividad'), true);
    },
  },
  {
    id: 26,
    name: 'Imperativos con tilde y enclíticos chilenos editan cotizaciones con precisión',
    run: async () => {
      const q = normalizeQuote({
        titulo_proyecto: 'Radier y radier estampado San Bernardo',
        modo_presupuesto: 'precio_acordado',
        tratamiento_iva: 'incluido',
        partidas_venta: [
          { nombre: 'Hormigón estampado', unidad: 'm2', cantidad: 60, precio_unitario: 35000, tipo: 'partida' },
          { nombre: 'Retiro de escombros', unidad: 'gl', cantidad: 1, precio_unitario: 0, precio_partida: 180000, tipo: 'partida' },
        ],
        materiales: [],
        mano_de_obra: [],
      });
      assert.equal(applyNaturalQuoteEdit(q, 'déjalo en valores netos más IVA')?.tratamiento_iva, 'neto');
      assert.equal(applyNaturalQuoteEdit(q, 'cámbiala a 75 m2')?.partidas_venta[0].cantidad, 75);
      assert.equal(applyNaturalQuoteEdit(q, 'sácale el retiro de escombros')?.partidas_venta.length, 1);
      assert.equal(applyNaturalQuoteEdit(q, 'agrégale flete $90.000')?.partidas_venta.length, 3);
      assert.equal(applyNaturalQuoteEdit(q, 'pónle 12 días hábiles')?.duracion_dias_estimada, 12);
      assert.equal(applyNaturalQuoteEdit(q, 'elimínale el retiro de escombros')?.partidas_venta.length, 1);
      const areaUnit = applyNaturalQuoteEdit(q, 'modifícale el hormigón estampado a $32.000 el m2');
      assert.equal(areaUnit?.partidas_venta[0].precio_unitario, 32000);

      const single = baseBathroomQuote();
      const singleLower = applyNaturalQuoteEdit(single, 'bájale el total a $1.750.000');
      assert.equal(singleLower?.partidas_venta[0].subtotal, 1750000);
    },
  },
  {
    id: 27,
    name: 'Suma alzada con guiones, + IVA aparte e hitos 50/50',
    run: async () => {
      const text = [
        'Cotización cierre perimetral pandereta Buin',
        '- Excavación y emplantillado',
        '- Instalación 45 mts lineales pandereta vibrada 2m',
        '- Colocación portón metálico',
        'Valor total $2.450.000 + IVA',
        '50% al inicio y 50% al entregar',
      ].join('\n');
      assert.equal(isQuoteWorkflow(text), true);
      const parsed = await parseQuoteMessage(text);
      assert.equal(parsed.tratamiento_iva, 'neto');
      assert.equal(parsed.partidas_venta[0].subtotal, 2450000);
      assert.equal(parsed.hitos_pago?.length, 2);
      assert.equal(parsed.hitos_pago?.[0]?.porcentaje, 50);
    },
  },
  {
    id: 28,
    name: 'Materiales detallados con x y c/u más mano de obra suman exacto',
    run: async () => {
      const text = [
        'Presupuesto techo quincho Colina',
        '20 planchas zinc 5v x $11.500 c/u',
        '35 palos pino 2x4 x $4.200',
        'Mano de obra carpintero $550.000',
        'IVA incluido',
      ].join('\n');
      assert.equal(isQuoteWorkflow(text), true);
      const parsed = await parseQuoteMessage(text);
      assert.equal(parsed.partidas_venta.length, 3);
      const total = parsed.partidas_venta.reduce((s, r) => s + r.subtotal, 0);
      assert.equal(total, 20 * 11500 + 4200 + 550000);
    },
  },
  {
    id: 29,
    name: 'Lista con «Total 1.250.000» sin signo peso se detecta y parsea como suma alzada',
    run: async () => {
      const text = [
        'Presupuesto pintura fachada Ñuñoa',
        '- Hidrolavado completo',
        '- Sellador acrílico',
        '- 2 manos látex exterior',
        'Total 1.250.000 IVA incluido',
      ].join('\n');
      assert.equal(isQuoteWorkflow(text), true);
      const parsed = await parseQuoteMessage(text);
      assert.equal(parsed.partidas_venta[0].subtotal, 1250000);
    },
  },
  {
    id: 30,
    name: 'Encabezado coloquial «Me pasas esto a pdf» no se toma como título de obra',
    run: async () => {
      const text = [
        'Me pasas esto a pdf',
        'Reparación filtración techo La Florida',
        'Cambio de cumbrera y sellado con membrana asfáltica',
        'Total: $480.000',
        'Anticipo 50% para materiales y saldo contra entrega',
      ].join('\n');
      assert.equal(isQuoteWorkflow(text), true);
      const parsed = await parseQuoteMessage(text);
      assert.match(parsed.titulo_proyecto, /La Florida/i);
      assert.doesNotMatch(parsed.titulo_proyecto, /pasas esto/i);
      assert.equal(parsed.partidas_venta[0].subtotal, 480000);
    },
  },
  {
    id: 31,
    name: 'Materiales sin precio + totales separados generan materiales_considerados reales',
    run: async () => {
      const text = [
        'Presupuesto radier patio Puente Alto',
        'Materiales:',
        '- 15 sacos cemento',
        '- 3 m3 ripio',
        '- 2 m3 arena',
        'Total materiales $320.000',
        'Mano de obra $480.000',
        'Total $800.000 IVA incluido',
      ].join('\n');
      assert.equal(isQuoteWorkflow(text), true);
      const parsed = await parseQuoteMessage(text);
      assert.equal(parsed.materiales_considerados?.length, 3);
      assert.equal(parsed.partidas_venta.reduce((s, r) => s + r.subtotal, 0), 800000);
    },
  },
  {
    id: 32,
    name: 'Pedidos coloquiales chilenos de PDF y Excel funcionan sin fallar',
    run: async () => {
      for (const phrase of ['pásamelo a pdf', 'llévalo a pdf', 'mándalo en pdf porfa']) {
        assert.equal(isQuotePdfRequest(phrase), true, phrase);
      }
      assert.equal(isQuotePdfRequest('hazme una cotización en pdf'), false);
      for (const phrase of ['pásamelo a planilla excel', 'pásalo a excel', 'bájalo en excel']) {
        assert.equal(isQuoteExcelRequest(phrase), true, phrase);
      }
    },
  },
  {
    id: 33,
    name: 'Comandos chilenos de cambio de estado («pasa ... a», «pon ... en curso»)',
    run: async () => {
      const { projectStatusCommand } = require('../lib/ai/project-status-command.ts');
      const activeProjects = [{ id: 'p1', nombre: 'Casa Buin', estado: 'activo' }];
      assert.equal(projectStatusCommand('pasa la obra Casa Buin a pausada', activeProjects, 'p1', [])?.accion?.estado, 'pausado');
      assert.equal(projectStatusCommand('pasa Casa Buin a terminada', activeProjects, 'p1', [])?.accion?.estado, 'terminado');
      assert.equal(projectStatusCommand('deja la obra Casa Buin en pausa', activeProjects, 'p1', [])?.accion?.estado, 'pausado');
      const pausedProjects = [{ id: 'p1', nombre: 'Casa Buin', estado: 'pausado' }];
      assert.equal(projectStatusCommand('pon Casa Buin en curso', pausedProjects, 'p1', [])?.accion?.estado, 'activo');
    },
  },
  {
    id: 34,
    name: 'Router ignora saludos multi-palabra y acepta verbos coloquiales de aplicar presupuesto',
    run: async () => {
      for (const greeting of ['hola buen día', 'buenos días', 'buenas tardes', 'muchas gracias']) {
        assert.equal(
          shouldUseSemanticIntentRouter(greeting, { channel: 'whatsapp', rol: 'admin', hasActiveQuote: true }, true),
          false,
          greeting,
        );
      }
      for (const cmd of [
        'súbele este presupuesto a la obra Casa Buin',
        'ponle esta cotización a la obra Casa Buin',
        'carga el presupuesto en la obra Casa Buin',
        'mete esta cotización a la obra Casa Buin',
      ]) {
        assert.equal(appliesQuoteToExistingProject(cmd), true, cmd);
      }
    },
  },
  {
    id: 35,
    name: 'Guardia de equipo nunca confunde materiales ni partidas con trabajadores',
    run: async () => {
      const projs = [{ id: 'p1', nombre: 'Casa Buin', estado: 'activo' }];
      const workers = [{ id: 'u1', nombre: 'Pedro Soto', rol: 'terreno' }];
      for (const phrase of [
        'agrega 20 sacos de cemento a la obra Casa Buin',
        'añade el retiro de escombros a la obra Casa Buin',
        'agrega el gantt a la obra Casa Buin',
      ]) {
        const res = personIntake([], null, null, phrase, projs, 'p1', workers);
        assert.equal(res.question, null, phrase);
        assert.equal(res.actions.length, 0, phrase);
      }
    },
  },
];

async function runDeterministicContractorEvals() {
  let passed = 0;
  const failures = [];
  for (const scenario of CONTRACTOR_EVAL_SCENARIOS) {
    try {
      await scenario.run();
      passed += 1;
    } catch (error) {
      failures.push({
        id: scenario.id,
        name: scenario.name,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return {
    total: CONTRACTOR_EVAL_SCENARIOS.length,
    passed,
    failed: failures.length,
    failures,
  };
}

module.exports = { CONTRACTOR_EVAL_SCENARIOS, runDeterministicContractorEvals };
