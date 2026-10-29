const fs = require("node:fs"),
  path = require("node:path");
const schema = [
  "supabase/schema.sql",
  "supabase/migrations_v2.sql",
  "supabase/produccion_copiloto.sql",
]
  .map((p) => fs.readFileSync(path.join(__dirname, "../..", p), "utf8"))
  .join("\n");
function columns(table) {
  const names = new Set();
  const rx = new RegExp(
    "CREATE TABLE(?: IF NOT EXISTS)? public\\." +
      table +
      " \\(([\\s\\S]*?)\\n\\);",
    "g",
  );
  for (const match of schema.matchAll(rx))
    for (const line of match[1].split("\n")) {
      const name =
        /^\s*([a-z_]+)\s+(?:TEXT|VARCHAR|NUMERIC|INTEGER|INT|DATE|TIMESTAMPTZ|BOOLEAN|BIGINT|JSONB)/i.exec(
          line,
        );
      if (name) names.add(name[1]);
    }
  const alters = new RegExp(
    "ALTER TABLE public\\." +
      table +
      " ADD COLUMN(?: IF NOT EXISTS)? ([a-z_]+)",
    "g",
  );
  for (const match of schema.matchAll(alters)) names.add(match[1]);
  return names;
}
const tables = new Map();
const calls = [];
const rpcCalls = [];
const rpcHandlers = new Map();
let failTable = "",
  failMode = "",
  remainingFailures = 0;
function collection(name) {
  if (!tables.has(name)) tables.set(name, []);
  return tables.get(name);
}
class Query {
  constructor(table) {
    this.table = table;
    this.filters = [];
    this.mode = "select";
    this.payload = null;
  }
  select(_fields, options) {
    if (options?.count) this.countRequested = true;
    return this;
  }
  gte(key, value) {
    this.filters.push((row) => row[key] >= value);
    return this;
  }
  contains(key, value) {
    this.filters.push((row) =>
      Array.isArray(value)
        ? value.every((v) => (row[key] || []).includes(v))
        : Object.entries(value).every(([k, v]) => row[key]?.[k] === v),
    );
    return this;
  }
  range(start, end) {
    this.start = start;
    this.maximum = end - start + 1;
    return this;
  }
  eq(key, value) {
    this.filters.push((row) => row[key] === value);
    return this;
  }
  in(key, values) {
    this.filters.push((row) => values.includes(row[key]));
    return this;
  }
  limit(n) {
    this.maximum = n;
    return this;
  }
  update(payload) {
    this.mode = "update";
    this.payload = payload;
    return this;
  }
  upsert(payload) {
    this.mode = "upsert";
    this.payload = payload;
    return this;
  }
  delete() {
    this.mode = "delete";
    return this;
  }
  order() {
    return this;
  }
  maybeSingle() {
    this.single = true;
    return this;
  }
  async run() {
    calls.push({ table: this.table, mode: this.mode, payload: this.payload });
    if (
      this.table === failTable &&
      (!failMode || this.mode === failMode) &&
      remainingFailures-- > 0
    )
      return {
        data: null,
        error: { code: "NETWORK", message: "not persisted" },
      };
    let rows = collection(this.table);
    if (this.mode === "update") {
      const matching = rows.filter((row) => this.filters.every((f) => f(row)));
      matching.forEach((row) => Object.assign(row, this.payload));
      return {
        data: this.single ? matching[0] || null : matching,
        error: null,
      };
    }
    if (this.mode === "upsert")
      for (const row of Array.isArray(this.payload)
        ? this.payload
        : [this.payload]) {
        const allowed = columns(this.table);
        for (const key of Object.keys(row))
          if (allowed.size && !allowed.has(key))
            return {
              data: null,
              error: {
                code: "PGRST204",
                message: "Unknown column " + this.table + "." + key,
              },
            };
        const id = row.id || `${row.proyecto_id}:${row.usuario_id}`;
        const i = rows.findIndex(
          (x) => (x.id || `${x.proyecto_id}:${x.usuario_id}`) === id,
        );
        if (i < 0) rows.push({ ...row });
        else rows[i] = { ...rows[i], ...row };
      }
    if (this.mode === "delete") {
      const removed = rows.filter((row) => this.filters.every((f) => f(row)));
      tables.set(
        this.table,
        rows.filter((row) => !removed.includes(row)),
      );
      return { data: removed, error: null };
    }
    const result =
      this.mode === "upsert"
        ? Array.isArray(this.payload)
          ? this.payload
          : [this.payload]
        : rows
            .filter((row) => this.filters.every((f) => f(row)))
            .slice(
              this.start || 0,
              this.maximum === undefined
                ? undefined
                : (this.start || 0) + this.maximum,
            );
    return {
      data: this.single ? result[0] || null : result,
      error: null,
      count: this.countRequested
        ? rows.filter((row) => this.filters.every((f) => f(row))).length
        : null,
    };
  }
  then(resolve, reject) {
    return this.run().then(resolve, reject);
  }
}
const supabase = {
  rpc: async (name, params) => {
    rpcCalls.push({ name, params });
    return rpcHandlers.has(name)
      ? await rpcHandlers.get(name)(params)
      : { data: null, error: { code: "NOT_CONFIGURED" } };
  },
  from: (table) => new Query(table),
  auth: {
    getSession: async () => ({
      data: { session: { access_token: "fixture-token" } },
      error: null,
    }),
  },
};
module.exports = {
  supabase,
  supabaseUrl: "https://fixture.supabase.co",
  supabaseAnonKey: "public-fixture-key",
  tables,
  calls,
  rpcCalls,
  handleRPC(name, handler) {
    rpcHandlers.set(name, handler);
  },
  reset() {
    tables.clear();
    calls.length = 0;
    rpcCalls.length = 0;
    rpcHandlers.clear();
    failTable = "";
    failMode = "";
    remainingFailures = 0;
  },
  fail(table, times = 1, mode = "") {
    failTable = table;
    failMode = mode;
    remainingFailures = times;
  },
};
