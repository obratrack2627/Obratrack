require('./helpers/typescript.cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { computeOperationalAlerts } = require('../lib/operational-alerts.ts');
const {
  PROJECT_TEMPLATES,
  buildTemplateActivities,
  shiftActivityDates,
} = require('../lib/project-templates.ts');
const {
  groupPendingMaterialsBySupplier,
  formatShoppingListMessage,
} = require('../lib/shopping-list.ts');
const { buildClientProgressWhatsAppText } = require('../lib/client-progress-summary.ts');
const { aggregateMonthlyAttendance } = require('../lib/attendance-monthly.ts');

const root = path.resolve(__dirname, '..');

function walkFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkFiles(full, out);
    else if (/\.(ts|tsx|css)$/.test(entry.name)) out.push(full);
  }
  return out;
}

test('computeOperationalAlerts detecta sobrecosto, accidentes, materiales urgentes, gantt vencido, asistencia y agenda ordenados por severidad', () => {
  const today = '2026-06-15';
  const proyectos = [
    {
      id: 'p1',
      empresa_id: 'emp1',
      nombre: 'Casa Ñuñoa',
      fecha_inicio: '2026-06-01',
      fecha_termino_estimada: '2026-07-15',
      estado: 'activo',
      monto_cotizado: 1000000,
      trabajadores_ids: ['u1'],
    },
    {
      id: 'p2',
      empresa_id: 'emp1',
      nombre: 'Quincho Cancelado',
      fecha_inicio: '2026-05-01',
      fecha_termino_estimada: '2026-06-01',
      estado: 'cancelada',
      monto_cotizado: 500000,
      trabajadores_ids: ['u1'],
    },
  ];

  const actividades = [
    {
      id: 'a1',
      proyecto_id: 'p1',
      nombre: 'Fundaciones',
      fecha_inicio: '2026-06-01',
      fecha_termino: '2026-06-08',
      porcentaje_avance: 50,
      estado: 'en_progreso',
      orden: 1,
    },
    {
      id: 'a2',
      proyecto_id: 'p1',
      nombre: 'Radier',
      fecha_inicio: '2026-06-16',
      fecha_termino: '2026-06-19',
      porcentaje_avance: 0,
      estado: 'pendiente',
      orden: 2,
    },
    {
      id: 'a3',
      proyecto_id: 'p2',
      nombre: 'Obra cancelada',
      fecha_inicio: '2026-05-01',
      fecha_termino: '2026-05-10',
      porcentaje_avance: 0,
      estado: 'pendiente',
      orden: 1,
    },
  ];

  const materiales = [
    {
      id: 'm1',
      proyecto_id: 'p1',
      actividad_id: 'a2',
      nombre: 'Cemento Polpaico',
      cantidad: 20,
      unidad: 'sacos',
      precio_unitario: 50000,
      subtotal: 1050000,
      comprado: false,
    },
  ];

  const reclamos = [
    {
      id: 'r1',
      proyecto_id: 'p1',
      tipo: 'accidente',
      prioridad: 'critica',
      estado: 'pendiente',
      titulo: 'Corte menor en faena',
      descripcion: 'Atención en mutual',
      impacto_monto: 0,
      impacto_dias: 0,
      materiales_requeridos: [],
      materiales_inyectados: false,
      origen: 'web',
      fecha: '2026-06-15',
    },
    {
      id: 'r2',
      proyecto_id: 'p1',
      tipo: 'reclamo',
      prioridad: 'media',
      estado: 'en_revision',
      titulo: 'Terminación zócalo',
      descripcion: 'Revisar encuentro',
      impacto_monto: 50000,
      impacto_dias: 1,
      materiales_requeridos: [],
      materiales_inyectados: false,
      origen: 'web',
      fecha: '2026-06-15',
    },
    {
      id: 'r3',
      proyecto_id: 'p2',
      tipo: 'reclamo',
      prioridad: 'alta',
      estado: 'pendiente',
      titulo: 'Obra ya cancelada',
      descripcion: 'No debe aparecer',
      impacto_monto: 0,
      impacto_dias: 0,
      materiales_requeridos: [],
      materiales_inyectados: false,
      origen: 'web',
      fecha: '2026-06-15',
    },
  ];

  const usuarios = [
    {
      id: 'u1',
      empresa_id: 'emp1',
      nombre: 'Carlos Maestro',
      rol: 'terreno',
      activo: true,
    },
  ];

  const agenda = [
    {
      id: 'ev1',
      titulo: 'Visita DOM',
      fecha: '2026-06-15',
      hora: '10:00',
      tipo: 'reunion_cliente',
      completado: false,
      proyecto_id: 'p1',
      proyecto_nombre: 'Casa Ñuñoa',
    },
    {
      id: 'ev2',
      titulo: 'Entrega futura',
      fecha: '2026-06-25',
      tipo: 'entrega_hito',
      completado: false,
    },
  ];

  const alerts = computeOperationalAlerts({
    proyectos,
    actividades,
    materiales,
    bitacora: [],
    imprevistos: [],
    reclamos,
    asistencias: [],
    usuarios,
    agenda,
    today,
  });

  assert.ok(alerts.some((a) => a.category === 'finanzas' && a.severity === 'critical'));
  assert.ok(alerts.some((a) => a.category === 'cambios' && a.severity === 'critical' && a.title.includes('Accidente')));
  assert.ok(alerts.some((a) => a.category === 'cambios' && a.severity === 'warning' && a.title.includes('Reclamo')));
  assert.ok(alerts.some((a) => a.category === 'materiales'));
  assert.ok(alerts.some((a) => a.category === 'gantt' && a.severity === 'critical'));
  assert.ok(alerts.some((a) => a.category === 'asistencia' && a.severity === 'info'));
  assert.ok(alerts.some((a) => a.category === 'agenda' && a.id === 'agenda-ev1'));

  assert.ok(!alerts.some((a) => a.projectId === 'p2'));
  assert.ok(!alerts.some((a) => a.id === 'agenda-ev2'));

  const severityOrder = { critical: 0, warning: 1, info: 2 };
  for (let i = 1; i < alerts.length; i++) {
    assert.ok(severityOrder[alerts[i - 1].severity] <= severityOrder[alerts[i].severity]);
  }
});

test('PROJECT_TEMPLATES tiene 6 plantillas y buildTemplateActivities/shiftActivityDates conservan duraciones contiguas', () => {
  assert.equal(PROJECT_TEMPLATES.length, 6);
  const generated = buildTemplateActivities('remodelacion_bano', '2026-06-01');
  assert.equal(generated.length, 5);
  assert.equal(generated[0].fecha_inicio, '2026-06-01');
  assert.equal(generated[0].fecha_termino, '2026-06-02');
  assert.equal(generated[1].fecha_inicio, '2026-06-03');

  const shifted = shiftActivityDates(generated, '2026-06-01', '2026-06-11');
  assert.equal(shifted[0].fecha_inicio, '2026-06-11');
  assert.equal(shifted[0].fecha_termino, '2026-06-12');
  assert.equal(shifted[1].fecha_inicio, '2026-06-13');

  const shiftedBack = shiftActivityDates(shifted, '2026-06-11', '2026-06-01');
  assert.equal(shiftedBack[0].fecha_inicio, '2026-06-01');
  assert.equal(shiftedBack[0].fecha_termino, '2026-06-02');
});

test('shopping-list excluye materiales comprados, agrupa por ferretería y formatea WhatsApp limpio', () => {
  const materiales = [
    {
      id: '1',
      proyecto_id: 'p1',
      nombre: 'Cemento Polpaico',
      cantidad: 12,
      unidad: 'sacos',
      precio_unitario: 4500,
      subtotal: 54000,
      proveedor: 'Sodimac',
      comprado: false,
    },
    {
      id: '2',
      proyecto_id: 'p1',
      nombre: 'Cerámica Blanca',
      cantidad: 20,
      unidad: 'm2',
      precio_unitario: 8000,
      subtotal: 160000,
      comprado: true,
    },
    {
      id: '3',
      proyecto_id: 'p1',
      nombre: 'Silicona Neutra',
      cantidad: 4,
      unidad: 'tubos',
      precio_unitario: 4900,
      subtotal: 19600,
      comprado: false,
    },
  ];

  const groups = groupPendingMaterialsBySupplier(materiales);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].proveedor, 'Ferretería / Por definir');
  assert.equal(groups[1].proveedor, 'Sodimac');

  const text = formatShoppingListMessage({
    proyectoNombre: 'Remodelación Baño',
    direccion: 'Av. Providencia 123',
    comuna: 'Providencia',
    materiales,
  });

  assert.match(text, /\*Lista de compras — Remodelación Baño\*/);
  assert.match(text, /Dirección: Av\. Providencia 123, Providencia/);
  assert.match(text, /- 12 sacos · Cemento Polpaico/);
  assert.match(text, /- 4 tubos · Silicona Neutra/);
  assert.ok(!text.includes('Cerámica Blanca'));
});

test('buildClientProgressWhatsAppText expone avance e hitos al mandante sin costos internos ni cobranza por defecto', () => {
  const proyecto = {
    id: 'p1',
    empresa_id: 'emp1',
    nombre: 'Ampliación Terraza',
    direccion: 'Los Leones 450',
    comuna: 'Providencia',
    fecha_inicio: '2026-06-01',
    fecha_termino_estimada: '2026-07-01',
    estado: 'activo',
    monto_cotizado: 5000000,
    total_pagado: 2500000,
    total_materiales: 1845000,
    total_imprevistos: 312000,
    porcentaje_avance_ponderado: 64,
  };
  const cliente = { id: 'c1', empresa_id: 'emp1', nombre: 'María González' };
  const actividades = [
    {
      id: 'a1',
      proyecto_id: 'p1',
      nombre: 'Radier y cimientos',
      fecha_inicio: '2026-06-01',
      fecha_termino: '2026-06-10',
      porcentaje_avance: 100,
      estado: 'terminada',
      orden: 1,
    },
    {
      id: 'a2',
      proyecto_id: 'p1',
      nombre: 'Estructura techumbre',
      fecha_inicio: '2026-06-11',
      fecha_termino: '2026-06-22',
      porcentaje_avance: 45,
      estado: 'en_progreso',
      orden: 2,
    },
  ];
  const bitacora = [
    {
      id: 'b1',
      proyecto_id: 'p1',
      autor_nombre: 'Juan',
      titulo: 'Hormigonado radier completado',
      nota: 'Sin novedades',
      fecha: '2026-06-10',
      tipo: 'avance',
    },
  ];

  const baseMsg = buildClientProgressWhatsAppText({
    proyecto,
    cliente,
    actividades,
    bitacora,
    incluirCobranza: false,
  });

  assert.match(baseMsg, /Hola María,/);
  assert.match(baseMsg, /Avance general: \*64%\* \(1\/2 partidas completadas\)/);
  assert.match(baseMsg, /Estructura techumbre: 45%/);
  assert.match(baseMsg, /Hormigonado radier completado/);
  assert.ok(!baseMsg.includes('1.845.000'));
  assert.ok(!baseMsg.includes('312.000'));
  assert.ok(!baseMsg.includes('Estado de pagos'));

  const withBilling = buildClientProgressWhatsAppText({
    proyecto,
    cliente,
    actividades,
    bitacora,
    incluirCobranza: true,
  });
  assert.match(withBilling, /\*Estado de pagos:\*/);
  assert.match(withBilling, /5\.000\.000/);
  assert.match(withBilling, /2\.500\.000/);
});

test('aggregateMonthlyAttendance agrupa métricas por trabajador, mes YYYY-MM y obra', () => {
  const proyectos = [
    { id: 'p1', nombre: 'Obra Norte' },
    { id: 'p2', nombre: 'Obra Sur' },
  ];
  const asistencias = [
    {
      id: '1',
      proyecto_id: 'p1',
      usuario_id: 'u1',
      trabajador_nombre: 'Pedro Pérez',
      trabajador_rol: 'Carpintero',
      fecha: '2026-06-02',
      estado: 'presente',
      horas_trabajadas: 8.5,
      origen: 'web',
    },
    {
      id: '2',
      proyecto_id: 'p2',
      usuario_id: 'u1',
      trabajador_nombre: 'Pedro Pérez',
      trabajador_rol: 'Carpintero',
      fecha: '2026-06-03',
      estado: 'atraso',
      horas_trabajadas: 7.25,
      origen: 'whatsapp_ia',
    },
    {
      id: '3',
      proyecto_id: 'p1',
      usuario_id: 'u2',
      trabajador_nombre: 'Ana Soto',
      trabajador_rol: 'Eléctrica',
      fecha: '2026-06-03',
      estado: 'licencia',
      horas_trabajadas: 0,
      origen: 'web',
    },
    {
      id: '4',
      proyecto_id: 'p1',
      usuario_id: 'u1',
      trabajador_nombre: 'Pedro Pérez',
      fecha: '2026-05-29',
      estado: 'presente',
      horas_trabajadas: 9,
      origen: 'web',
    },
  ];

  const allJune = aggregateMonthlyAttendance(asistencias, proyectos, '2026-06', 'todas');
  assert.equal(allJune.length, 2);
  assert.equal(allJune[0].trabajador, 'Ana Soto');
  assert.equal(allJune[0].licenciasPermisos, 1);

  assert.equal(allJune[1].trabajador, 'Pedro Pérez');
  assert.equal(allJune[1].presentes, 1);
  assert.equal(allJune[1].atrasos, 1);
  assert.equal(allJune[1].totalDias, 2);
  assert.equal(allJune[1].totalHoras, 15.8);
  assert.deepEqual(allJune[1].obras, ['Obra Norte', 'Obra Sur']);

  const onlyP1 = aggregateMonthlyAttendance(asistencias, proyectos, '2026-06', 'p1');
  const pedroP1 = onlyP1.find((r) => r.trabajador === 'Pedro Pérez');
  assert.equal(pedroP1.totalDias, 1);
  assert.equal(pedroP1.totalHoras, 8.5);
});

test('regresión estática Tailwind: no existen clases inválidas py-0.2 ni backdrop-blur-xs en app/ ni components/', () => {
  const files = [
    ...walkFiles(path.join(root, 'app')),
    ...walkFiles(path.join(root, 'components')),
  ];
  for (const file of files) {
    const content = fs.readFileSync(file, 'utf8');
    assert.ok(!content.includes('py-0.2'), `py-0.2 encontrado en ${file}`);
    assert.ok(!content.includes('backdrop-blur-xs'), `backdrop-blur-xs encontrado en ${file}`);
  }
});
