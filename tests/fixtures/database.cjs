const { readFileSync } = require("node:fs");
const path = require("node:path");
/** @param {{ exec: (sql: string) => Promise<unknown> }} db */
module.exports = async function prepararDatabase(db) {
  await db.exec(
    readFileSync(path.join(__dirname, "operaciones-schema.sql"), "utf8"),
  );
  // Se carga el esquema real exclusivamente en una base embebida descartable.
  // gen_random_uuid está integrado en PostgreSQL; uuid-ossp no se usa en el esquema.
  const esquema = readFileSync(
    path.join(__dirname, "../../supabase/schema.sql"),
    "utf8",
  ).replace('CREATE EXTENSION IF NOT EXISTS "uuid-ossp";', "");
  await db.exec(esquema);
  await db.exec(`
   GRANT SELECT ON ALL TABLES IN SCHEMA public TO authenticated;
   GRANT INSERT, UPDATE ON public.usuarios TO authenticated;
   INSERT INTO empresas(id,rut,nombre,plan_id) VALUES('empresa-a','76.100.000-1','Empresa A','pro'),('empresa-b','76.200.000-2','Empresa B','pro');
   INSERT INTO usuarios(id,auth_user_id,empresa_id,nombre,rol,is_dev) VALUES('u-a','00000000-0000-0000-0000-000000000001','empresa-a','Maestro de prueba','terreno',false),('u-b','00000000-0000-0000-0000-000000000002','empresa-b','Otro trabajador','terreno',false);
   INSERT INTO clientes(id,empresa_id,nombre) VALUES('c-a','empresa-a','Cliente de prueba'),('c-b','empresa-b','Otro cliente');
 `);
};
