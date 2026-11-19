require("./helpers/typescript.cjs");
const { test, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const { NextRequest } = require("next/server");
const {
  PUSH_ICON_PATH,
  buildPushPayload,
  sendPushToUsers,
  sendPushIdempotent,
  resetCachedVapidForTest,
} = require("../lib/push/server.ts");
const { runScheduledPushReminders } = require("../lib/push/events.ts");
const { GET: cronGET } = require("../app/api/notificaciones/cron/route.ts");

const savedEnv = { ...process.env };
afterEach(() => {
  for (const key of Object.keys(process.env)) {
    if (!(key in savedEnv)) delete process.env[key];
  }
  Object.assign(process.env, savedEnv);
  resetCachedVapidForTest();
});

function createPushDb(seed = {}) {
  const db = {
    push_suscripciones: seed.push_suscripciones || [],
    notificaciones_push_enviadas: seed.notificaciones_push_enviadas || [],
    proyectos: seed.proyectos || [],
    agenda_eventos: seed.agenda_eventos || [],
    actividades: seed.actividades || [],
    proyecto_trabajadores: seed.proyecto_trabajadores || [],
    push_vapid_config: seed.push_vapid_config || [],
  };

  const AGENDA_REAL_COLUMNS = new Set([
    "id",
    "empresa_id",
    "proyecto_id",
    "usuario_id",
    "titulo",
    "fecha_inicio",
    "fecha_fin",
    "tipo",
    "created_at",
  ]);

  return {
    db,
    from(table) {
      let predicates = [];
      let updatePatch = null;
      let single = false;
      let op = "select";
      let columnError = null;

      const query = {
        select(cols) {
          if (table === "agenda_eventos" && typeof cols === "string" && cols !== "*") {
            const bad = cols.split(",").map((c) => c.trim()).filter((c) => c && !AGENDA_REAL_COLUMNS.has(c));
            if (bad.length) columnError = { code: "42703", message: `column ${bad[0]} does not exist` };
          }
          return query;
        },
        eq(k, v) { predicates.push((r) => r[k] === v); return query; },
        in(k, vals) { predicates.push((r) => vals.includes(r[k])); return query; },
        maybeSingle() { single = true; return query; },
        update(patch) {
          op = "update";
          updatePatch = patch;
          return query;
        },
        upsert(row, opts = {}) {
          const rows = Array.isArray(row) ? row : [row];
          const conflictKey = opts.onConflict || "id";
          for (const item of rows) {
            const idx = db[table].findIndex((r) => r[conflictKey] === item[conflictKey]);
            if (idx >= 0) {
              if (!opts.ignoreDuplicates) db[table][idx] = { ...db[table][idx], ...item };
            } else {
              db[table].push({ ...item });
            }
          }
          return query;
        },
        then(resolve, reject) {
          if (columnError) {
            return Promise.resolve({ data: null, error: columnError }).then(resolve, reject);
          }
          if (op === "update" && updatePatch) {
            for (const row of db[table] || []) {
              if (predicates.every((p) => p(row))) Object.assign(row, updatePatch);
            }
            return Promise.resolve({ data: null, error: null }).then(resolve, reject);
          }
          const matched = (db[table] || []).filter((r) => predicates.every((p) => p(r)));
          return Promise.resolve({
            data: single ? matched[0] || null : matched,
            error: null,
          }).then(resolve, reject);
        },
      };
      return query;
    },
  };
}

test("buildPushPayload incluye el logo de ObraTrack y sanitiza URLs externas", () => {
  const safe = buildPushPayload({
    title: "Inicio mañana · Casa Norte",
    body: "Tu obra comienza mañana.",
    url: "/proyectos/p-1",
    categoria: "inicio_plazos",
  });
  assert.equal(safe.icon, PUSH_ICON_PATH);
  assert.equal(safe.badge, PUSH_ICON_PATH);
  assert.equal(safe.url, "/proyectos/p-1");

  const sanitized = buildPushPayload({
    title: "Alerta",
    body: "Detalle",
    url: "https://evil.example/phish",
  });
  assert.equal(sanitized.url, "/dashboard");
});

test("sendPushToUsers respeta preferencias, excluye al emisor y desactiva endpoints 410 Gone", async () => {
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = "test-pub";
  process.env.VAPID_PRIVATE_KEY = "test-priv";

  const sb = createPushDb({
    push_suscripciones: [
      {
        id: "s-jefe",
        empresa_id: "e1",
        usuario_id: "u-jefe",
        rol: "admin",
        endpoint: "https://fcm.googleapis.com/jefe",
        p256dh: "k1",
        auth: "a1",
        preferencias: { incidentes_bitacora: true },
        activo: true,
      },
      {
        id: "s-sup-muted",
        empresa_id: "e1",
        usuario_id: "u-sup",
        rol: "supervisor",
        endpoint: "https://fcm.googleapis.com/sup",
        p256dh: "k2",
        auth: "a2",
        preferencias: { incidentes_bitacora: false },
        activo: true,
      },
      {
        id: "s-worker-actor",
        empresa_id: "e1",
        usuario_id: "u-worker",
        rol: "terreno",
        endpoint: "https://fcm.googleapis.com/worker",
        p256dh: "k3",
        auth: "a3",
        preferencias: { incidentes_bitacora: true },
        activo: true,
      },
      {
        id: "s-dead",
        empresa_id: "e1",
        usuario_id: "u-jefe-old",
        rol: "admin",
        endpoint: "https://fcm.googleapis.com/dead",
        p256dh: "k4",
        auth: "a4",
        preferencias: { incidentes_bitacora: true },
        activo: true,
      },
    ],
  });

  const sent = [];
  const res = await sendPushToUsers(
    sb,
    {
      empresaId: "e1",
      roles: ["admin", "supervisor", "terreno"],
      excludeUserIds: ["u-worker"],
      categoria: "incidentes_bitacora",
      payload: {
        title: "Incidente en Baño",
        body: "Filtración reportada",
        url: "/proyectos/p-bano",
      },
    },
    async (sub, payload) => {
      if (sub.endpoint.endsWith("/dead")) {
        const err = new Error("Gone");
        err.statusCode = 410;
        throw err;
      }
      sent.push({ endpoint: sub.endpoint, data: JSON.parse(payload) });
    },
  );

  assert.equal(res.attempted, 2);
  assert.equal(res.sent, 1);
  assert.equal(res.deactivated, 1);
  assert.equal(sent[0].endpoint, "https://fcm.googleapis.com/jefe");
  assert.equal(sent[0].data.icon, PUSH_ICON_PATH);
  assert.equal(sb.db.push_suscripciones.find((s) => s.id === "s-dead").activo, false);
});

test("runScheduledPushReminders avisa el día previo (19 nov) y el mismo día (20 nov) sin duplicar y aislando trabajadores asignados", async () => {
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = "test-pub";
  process.env.VAPID_PRIVATE_KEY = "test-priv";

  const sb = createPushDb({
    push_suscripciones: [
      { id: "1", empresa_id: "e1", usuario_id: "u-admin", rol: "admin", endpoint: "https://push/admin", p256dh: "p", auth: "a", activo: true, preferencias: {} },
      { id: "2", empresa_id: "e1", usuario_id: "u-w1", rol: "terreno", endpoint: "https://push/w1", p256dh: "p", auth: "a", activo: true, preferencias: {} },
      { id: "3", empresa_id: "e1", usuario_id: "u-w2", rol: "terreno", endpoint: "https://push/w2", p256dh: "p", auth: "a", activo: true, preferencias: {} },
    ],
    proyectos: [
      { id: "p-norte", empresa_id: "e1", nombre: "Casa Norte", estado: "pendiente", fecha_inicio: "2026-11-20", fecha_termino_estimada: "2026-12-10" },
    ],
    proyecto_trabajadores: [
      { proyecto_id: "p-norte", usuario_id: "u-w1" },
    ],
    agenda_eventos: [
      { id: "ev-1", empresa_id: "e1", titulo: "Reunión arranque Casa Norte", fecha_inicio: "2026-11-20T11:30:00.000Z", fecha_fin: "2026-11-20T12:30:00.000Z", tipo: "visita", proyecto_id: "p-norte" },
    ],
  });

  const delivered = [];
  const fakeSend = async (sub, raw) => {
    delivered.push({ endpoint: sub.endpoint, ...JSON.parse(raw) });
  };

  // Día 19 nov 2026 (11:00 UTC = 08:00 Chile) -> avisa que Casa Norte empieza mañana + agenda mañana.
  const day19 = new Date("2026-11-19T11:00:00.000Z");
  await runScheduledPushReminders(sb, day19, fakeSend);
  assert.ok(delivered.some((d) => d.endpoint === "https://push/admin" && /Inicio mañana · Casa Norte/.test(d.title)));
  assert.ok(delivered.some((d) => d.endpoint === "https://push/admin" && /Agenda mañana · 08:30/.test(d.title)));
  assert.ok(delivered.some((d) => d.endpoint === "https://push/w1" && /Mañana inicias en Casa Norte/.test(d.title)));
  assert.ok(!delivered.some((d) => d.endpoint === "https://push/w2"));

  // Reintento del mismo día 19 nov -> idempotente, no duplica envíos.
  const countAfterFirst = delivered.length;
  const second = await runScheduledPushReminders(sb, day19, fakeSend);
  assert.equal(delivered.length, countAfterFirst);
  assert.equal(second.sent, 0);

  // Día 20 nov 2026 (11:00 UTC = 08:00 Chile) -> avisa hoy empieza Casa Norte + hoy en agenda.
  delivered.length = 0;
  const day20 = new Date("2026-11-20T11:00:00.000Z");
  await runScheduledPushReminders(sb, day20, fakeSend);
  assert.ok(delivered.some((d) => d.endpoint === "https://push/admin" && /Inicio hoy · Casa Norte/.test(d.title)));
  assert.ok(delivered.some((d) => d.endpoint === "https://push/admin" && /Hoy en tu agenda · 08:30/.test(d.title)));
  assert.ok(delivered.some((d) => d.endpoint === "https://push/w1" && /Hoy comienzas en Casa Norte/.test(d.title)));
});

test("endpoint cron /api/notificaciones/cron rechaza accesos sin CRON_SECRET válido", async () => {
  process.env.CRON_SECRET = "super-secret";
  const unauthorized = await cronGET(new NextRequest("https://example.test/api/notificaciones/cron"));
  assert.equal(unauthorized.status, 401);
});

test('envío predeterminado soporta web-push ESM sin exportación default',async()=>{
 const packagePath=require.resolve('web-push');const serverPath=require.resolve('../lib/push/server.ts');
 const oldPackage=require.cache[packagePath];const oldServer=require.cache[serverPath];
 const actual=require('web-push');
 try{
  require.cache[packagePath]={...oldPackage,exports:{...actual,__esModule:true}};
  delete require.cache[serverPath];
  const {sendPushToUsers:send}=require('../lib/push/server.ts');
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY='fixture-public';process.env.VAPID_PRIVATE_KEY='fixture-private';
  const db={from(){return {select(){return this;},eq(){return this;},then(resolve){return Promise.resolve({data:[],error:null}).then(resolve);}};}};
  assert.deepEqual(await send(db,{empresaId:'fixture-company',payload:{title:'Prueba'}}),{attempted:0,sent:0,deactivated:0});
 }finally{require.cache[packagePath]=oldPackage;require.cache[serverPath]=oldServer;}
});
