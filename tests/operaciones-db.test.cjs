const { test } = require("node:test");
const assert = require("node:assert/strict");
const { PGlite } = require("@electric-sql/pglite");
const fs = require("node:fs");
const path = require("node:path");

test("migración, transacciones y aislamiento de empresas en PostgreSQL", async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  await require("./fixtures/database.cjs")(db);
  const migration = fs.readFileSync(
    path.join(
      __dirname,
      "../supabase/migrations/20261020_flujo_constructor.sql",
    ),
    "utf8",
  );
  await db.exec(migration);
  await db.exec(migration); // La migración es repetible y no elimina registros.
  await db.exec(
    "SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false)",
  );
  const rpc = async (name, data, version) => {
    const result = await db.query(
      `SELECT to_jsonb(public.${name}($1::jsonb,$2::integer)) AS row`,
      [JSON.stringify(data), version],
    );
    return result.rows[0].row;
  };
  const q = {
    id: "q-1",
    empresa_id: "empresa-a",
    cliente_id: "c-a",
    titulo: "Terraza",
    direccion: "Santiago",
    fecha: "2026-10-20",
    visita: "",
    observaciones: "Radier",
    estado: "Borrador",
    fecha_inicio: "2026-10-20",
    fecha_termino: "2026-11-20",
    margen: 20,
    iva: true,
    lineas: [
      {
        id: "l1",
        partida: "Terraza",
        descripcion: "Radier",
        cantidad: 2,
        precio: 1000000,
        categoria: "Materiales",
        unidad: "m2",
      },
    ],
  };
  let quote;
  await t.test(
    "guardar cotización y rechazar clientes de otra empresa",
    async () => {
      quote = await rpc("guardar_cotizacion", q, 0);
      assert.equal(quote.revision, 1);
      await assert.rejects(
        rpc("guardar_cotizacion", { ...q, id: "q-bad", cliente_id: "c-b" }, 0),
        /Cliente inválido/,
      );
      await assert.rejects(
        rpc(
          "guardar_cotizacion",
          { ...q, id: "q-bad", empresa_id: "empresa-b" },
          0,
        ),
        /Sin acceso/,
      );
      await assert.rejects(
        rpc(
          "guardar_cotizacion",
          { ...q, lineas: [{ ...q.lineas[0], precio: -1 }] },
          1,
        ),
        /Revisa/,
      );
    },
  );
  let pid;
  await t.test(
    "conversión requiere aprobación y es atómica e idempotente",
    async () => {
      await assert.rejects(
        db.query("SELECT public.convertir_cotizacion($1,$2)", [q.id, 1]),
        /aprueba/,
      );
      quote = await rpc("guardar_cotizacion", { ...q, estado: "Aprobada" }, 1);
      const r = await db.query("SELECT public.convertir_cotizacion($1,$2) id", [
        q.id,
        2,
      ]);
      pid = r.rows[0].id;
      const again = await db.query(
        "SELECT public.convertir_cotizacion($1,$2) id",
        [q.id, 2],
      );
      assert.equal(again.rows[0].id, pid);
      const p = await db.query("SELECT * FROM proyectos WHERE id=$1", [pid]);
      assert.equal(Number(p.rows[0].monto_cotizado), 2856000);
      const projects = await db.query("SELECT count(*) AS n FROM proyectos");
      assert.equal(Number(projects.rows[0].n), 1);
      const acts = await db.query(
        "SELECT * FROM actividades WHERE proyecto_id=$1",
        [pid],
      );
      assert.equal(acts.rows.length, 1);
      await assert.rejects(
        rpc("guardar_cotizacion", { ...q, estado: "Modificada" }, 3),
        /ya es una obra/,
      );
      await db.exec("RESET ROLE");
      await assert.rejects(
        db.query("UPDATE proyectos SET monto_cotizado=1 WHERE id=$1", [pid]),
        /contrato original/,
      );
      await db.exec("SET ROLE authenticated");
    },
  );
  let gestion;
  await t.test(
    "RLS oculta registros ajenos y evita escrituras directas",
    async () => {
      await db.exec(
        "SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false)",
      );
      assert.equal(
        (await db.query("SELECT * FROM cotizaciones_obra")).rows.length,
        0,
      );
      assert.equal(
        (await db.query("SELECT * FROM gestion_obras")).rows.length,
        0,
      );
      await assert.rejects(
        db.query("SELECT public.convertir_cotizacion($1,$2)", [q.id, 3]),
        /no disponible/,
      );
      await assert.rejects(
        db.exec(
          "INSERT INTO cotizaciones_obra(id,empresa_id,cliente_id,datos) VALUES('x','empresa-b','c-b','{}')",
        ),
        /permission denied/,
      );
      await db.exec(
        "SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false)",
      );
      gestion = (
        await db.query("SELECT * FROM gestion_obras WHERE proyecto_id=$1", [
          pid,
        ])
      ).rows[0];
    },
  );
  await t.test(
    "control de versiones evita perder cambios simultáneos",
    async () => {
      const next = { ...gestion.datos, etapa: "En ejecución" };
      gestion = await rpc("guardar_gestion", next, 1);
      assert.equal(gestion.revision, 2);
      await assert.rejects(
        rpc("guardar_gestion", { ...next, etapa: "Terminaciones" }, 1),
        /registro cambió/,
      );
    },
  );
  await t.test(
    "valida gastos, cobros, trabajadores y aprobaciones en el servidor",
    async () => {
      await assert.rejects(
        rpc(
          "guardar_gestion",
          { ...gestion.datos, gastos: [{ monto: -1 }] },
          2,
        ),
        /Gasto inválido/,
      );
      await assert.rejects(
        rpc(
          "guardar_gestion",
          {
            ...gestion.datos,
            jornadas: [
              { trabajador_id: "u-b", jornadas: 1, valor_diario: 30000 },
            ],
          },
          2,
        ),
        /trabajadores/,
      );
      await assert.rejects(
        rpc(
          "guardar_gestion",
          {
            ...gestion.datos,
            adicionales: [
              {
                id: "a",
                descripcion: "Trabajo",
                fecha: "2026-10-20",
                estado: "Aprobado",
                materiales: 100,
                mano_obra: 0,
                aprobacion: "",
              },
            ],
          },
          2,
        ),
        /aprobación/,
      );
      await assert.rejects(
        rpc(
          "guardar_gestion",
          { ...gestion.datos, estados_pago: [{ monto: -1 }] },
          2,
        ),
        /pago inválido/,
      );
    },
  );
  await t.test(
    "cierre verifica saldo y avance, y mantiene el contrato original",
    async () => {
      await assert.rejects(
        rpc("guardar_gestion", { ...gestion.datos, etapa: "Finalizada" }, 2),
        /Revisa avance/,
      );
      const next = {
        ...gestion.datos,
        etapa: "Finalizada",
        cierre: {
          fecha: "2026-11-20",
          observaciones: "Conforme",
          documentos: [],
        },
        actividades: gestion.datos.actividades.map((a) => ({
          ...a,
          avance: 100,
          estado: "Terminada",
        })),
        estados_pago: [
          {
            id: "pay",
            numero: 1,
            fecha: "2026-10-20",
            vencimiento: "2026-11-20",
            monto: 2856000,
            motivo: "Contrato",
            avance: 100,
            estado: "Pagado",
            fecha_pago: "2026-11-20",
          },
        ],
      };
      gestion = await rpc("guardar_gestion", next, 2);
      const p = (await db.query("SELECT * FROM proyectos WHERE id=$1", [pid]))
        .rows[0];
      assert.equal(p.estado, "terminado");
      assert.equal(Number(p.monto_cotizado), 2856000);
      assert.equal(gestion.datos.cierre.resumen.utilidad, 2856000);
      await assert.rejects(
        rpc("guardar_gestion", { ...next, etapa: "En ejecución" }, 3),
        /cerrada/,
      );
    },
  );
  await t.test(
    "documentos privados aislados por carpeta de empresa",
    async () => {
      await db.exec(
        "INSERT INTO storage.objects(id,bucket_id,name) VALUES('f1','documentos-obras','empresa-a/foto.jpg')",
      );
      await assert.rejects(
        db.exec(
          "INSERT INTO storage.objects(id,bucket_id,name) VALUES('f2','documentos-obras','empresa-b/foto.jpg')",
        ),
        /row-level security/,
      );
      await db.exec(
        "SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false)",
      );
      assert.equal(
        (await db.query("SELECT * FROM storage.objects")).rows.length,
        0,
      );
    },
  );
});
