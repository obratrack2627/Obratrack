import type {
  Actividad,
  AsistenciaObrero,
  Proyecto,
  Usuario,
} from "@/types/database";

export const crewText = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
export function assignedCrew(project: Proyecto, users: Usuario[]) {
  return users.filter(
    (user) =>
      user.empresa_id === project.empresa_id &&
      project.trabajadores_ids?.includes(user.id),
  );
}
export function crewAttendance(
  user: Usuario,
  records: AsistenciaObrero[],
  users: Usuario[],
) {
  const exact = records.find((row) => row.usuario_id === user.id);
  if (exact) return exact;
  if (
    users.filter((other) => crewText(other.nombre) === crewText(user.nombre))
      .length !== 1
  )
    return undefined;
  return records.find(
    (row) =>
      !row.usuario_id &&
      crewText(row.trabajador_nombre) === crewText(user.nombre),
  );
}

const trades = [
  {
    skills: /carpinter|moldaj|muebl/,
    work: /carpinter|madera|moldaj|pino|osb|entabl|deck/,
  },
  {
    skills: /soldad|estructuras? metal|metalurg/,
    work: /soldad|estructuras? metal|montaje metal|cerchas? metal/,
  },
  {
    skills: /techumbre|cubierta|hojalat/,
    work: /techumbre|cubierta|zinc|tejas?|canaleta/,
  },
  {
    skills: /gasfit|sanitaria|plomer/,
    work: /gasfit|sanitaria|agua potable|alcantarill|canerias?/,
  },
  { skills: /electric/, work: /electric|enchufe|tablero electr/ },
  {
    skills: /albanil|mampost|estuc/,
    work: /albanil|mampost|ladrill|estuco|bloques?/,
  },
  {
    skills: /hormigon|radier|concreter|fundaci/,
    work: /hormigon|radier|fundaci/,
  },
  { skills: /enfierr|armador/, work: /enfierr|armadura|armado de acero/ },
  { skills: /pintur|pintor|empast/, work: /pintur|pintar|empast|lijado/ },
  {
    skills: /ceramic|porcelanat|revestim/,
    work: /ceramic|porcelanat|baldosa|revestim/,
  },
  { skills: /tabiqu|yeso|vulcanit/, work: /tabiqu|yeso|vulcanit|cielo falso/ },
  {
    skills: /excav|movimiento de tierra|operador/,
    work: /excav|movimiento de tierra|nivelacion de terreno/,
  },
];
export function crewSuggestions(
  project: Proyecto,
  users: Usuario[],
  projects: Proyecto[],
  activities: Actividad[],
  attendance: AsistenciaObrero[],
  date: string,
) {
  const stages = activities
    .filter(
      (row) =>
        row.proyecto_id === project.id &&
        row.estado !== "terminada" &&
        row.porcentaje_avance < 100,
    )
    .sort(
      (a, b) =>
        String(a.fecha_inicio || "").localeCompare(
          String(b.fecha_inicio || ""),
        ) || a.orden - b.orden,
    )
    .slice(0, 4);
  const work = stages.length
    ? stages.map((row) => ({ name: row.nombre, text: crewText(row.nombre) }))
    : [
        {
          name: project.nombre,
          text: crewText(project.nombre + " " + (project.descripcion || "")),
        },
      ];
  return users
    .filter(
      (user) =>
        user.empresa_id === project.empresa_id &&
        ["terreno", "supervisor"].includes(user.rol) &&
        !project.trabajadores_ids?.includes(user.id),
    )
    .map((user) => {
      const matched = (user.especialidades || []).filter((skill) =>
        work.some(
          (stage) =>
            trades.some(
              (trade) =>
                trade.skills.test(crewText(skill)) &&
                trade.work.test(stage.text),
            ) || stage.text.includes(crewText(skill)),
        ),
      );
      const stage = work.find((stage) =>
        matched.some(
          (skill) =>
            trades.some(
              (trade) =>
                trade.skills.test(crewText(skill)) &&
                trade.work.test(stage.text),
            ) || stage.text.includes(crewText(skill)),
        ),
      );
      const otherProjects = projects.filter(
        (row) =>
          row.empresa_id === project.empresa_id &&
          row.id !== project.id &&
          ["activo", "pausado"].includes(row.estado) &&
          row.trabajadores_ids?.includes(user.id),
      );
      const leave = attendance.find(
        (row) =>
          row.usuario_id === user.id &&
          row.fecha === date &&
          ["licencia", "permiso"].includes(row.estado),
      );
      return {
        user,
        matched,
        otherProjects,
        leave,
        reason: stage
          ? `Coincide con «${stage.name}».`
          : "No hay coincidencias de especialidad registradas.",
        score: matched.length * 10 - Math.min(otherProjects.length, 5),
      };
    })
    .filter((row) => row.matched.length && !row.leave)
    .sort(
      (a, b) =>
        b.score - a.score || a.user.nombre.localeCompare(b.user.nombre, "es"),
    )
    .slice(0, 3);
}

export function attendanceDuration(
  start: string,
  end: string,
  breakMinutes = 0,
) {
  if (!start || !end) return 0;
  const minutes = (time: string) => {
    const [hour, minute] = time.split(":").map(Number);
    return hour * 60 + minute;
  };
  const duration = minutes(end) - minutes(start) - breakMinutes;
  if (
    !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(start) ||
    !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(end) ||
    !Number.isFinite(duration) ||
    duration < 0 ||
    minutes(end) <= minutes(start) ||
    !Number.isFinite(breakMinutes) ||
    breakMinutes < 0
  )
    throw new Error("Revisa las horas de entrada, salida y colación.");
  return Math.round((duration / 60) * 100) / 100;
}
