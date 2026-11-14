import type { DailyClose } from "./daily-close";
import { formatCLP, formatDate } from "./utils";

export function dailyCloseFilename(summary: DailyClose) {
  const project = summary.proyecto_nombre
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .slice(0, 70);
  return `ObraTrack_cierre_${project}_${summary.fecha}_r${summary.version}.pdf`;
}

/** Compartido por la descarga web y el PDF privado enviado por WhatsApp. */
export async function createDailyClosePDF(summary: DailyClose) {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);
  const pdf = new jsPDF();
  const navy: [number, number, number] = [20, 26, 35];
  const orange: [number, number, number] = [255, 106, 0];
  pdf.setFillColor(...navy);
  pdf.rect(0, 0, 210, 49, "F");
  pdf.setTextColor(...orange);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(10);
  pdf.text("OBRATRACK / INFORME DE JORNADA", 14, 13);
  pdf.setTextColor(255);
  pdf.setFontSize(21);
  pdf.text("Cierre de jornada", 14, 25);
  pdf.setFontSize(10);
  pdf.setFont("helvetica", "normal");
  pdf.text(
    pdf.splitTextToSize(summary.proyecto_nombre, 180).slice(0, 2),
    14,
    34,
  );
  pdf.text(
    `${formatDate(summary.fecha)}   |   Revision ${summary.version}`,
    14,
    45,
  );
  pdf.setTextColor(...navy);
  const metrics = [
    ["Personas presentes", String(summary.presentes)],
    ["Horas-hombre", String(summary.horas)],
    ["Ingresos", formatCLP(summary.ingresos)],
    ["Gastos del dia", formatCLP(summary.gastos)],
  ];
  metrics.forEach(([label, value], index) => {
    const x = 14 + index * 46;
    pdf.setFillColor(250, 248, 245);
    pdf.roundedRect(x, 56, 44, 23, 2, 2, "F");
    pdf.setFontSize(8);
    pdf.setTextColor(100);
    pdf.text(label, x + 3, 63);
    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(...navy);
    pdf.setFontSize(value.length > 12 ? 9 : 12);
    pdf.text(value, x + 3, 73);
    pdf.setFont("helvetica", "normal");
  });
  let y = 87;
  const table = (title: string, head: string[], body: string[][]) => {
    if (y > 250) {
      pdf.addPage();
      y = 20;
    }
    pdf.setTextColor(...navy);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(11);
    pdf.text(title, 14, y);
    pdf.setFont("helvetica", "normal");
    autoTable(pdf, {
      startY: y + 4,
      head: [head],
      body: body.length
        ? body
        : [
            [
              "Sin registros para esta jornada.",
              ...head.slice(1).map(() => ""),
            ],
          ],
      margin: { left: 14, right: 14, top: 18, bottom: 22 },
      styles: {
        font: "helvetica",
        fontSize: 9,
        cellPadding: 3,
        overflow: "linebreak",
        textColor: navy,
      },
      headStyles: { fillColor: navy, textColor: [255, 255, 255], fontStyle: "bold" },
      alternateRowStyles: { fillColor: [250, 248, 245] },
      rowPageBreak: "avoid",
    });
    y = (pdf as any).lastAutoTable.finalY + 13;
  };
  table(
    "Asistencia confirmada",
    ["Persona", "Estado", "Horas"],
    summary.personas.map((row) => [row.nombre, row.estado, String(row.horas)]),
  );
  table(
    "Avances y reportes de terreno",
    ["Registro", "Detalle"],
    summary.avances.map((row) => [
      row.titulo,
      `${row.nota}${row.foto_url ? "\nFotografia disponible en la bitacora de la obra." : ""}`,
    ]),
  );
  table(
    "Materiales recibidos",
    ["Material", "Cantidad"],
    summary.recepciones.map((row) => [
      row.material,
      `${row.cantidad} ${row.unidad}`,
    ]),
  );
  table(
    "Pendientes e incidentes",
    ["Detalle"],
    summary.pendientes.map((row) => [row]),
  );
  table(
    "Proxima jornada",
    ["Trabajo previsto"],
    summary.tareas_manana.map((row) => [row]),
  );
  table(
    "Observaciones y confirmacion",
    ["Registro", "Detalle"],
    [
      [
        "Observacion de jefatura",
        summary.nota || "Sin observaciones adicionales.",
      ],
      [
        "Confirmado por",
        summary.confirmado_por || "Vista previa sin confirmar",
      ],
      [
        "Fecha de confirmacion",
        summary.confirmado_en
          ? new Intl.DateTimeFormat("es-CL", {
              timeZone: "America/Santiago",
              dateStyle: "medium",
              timeStyle: "short",
            }).format(new Date(summary.confirmado_en))
          : "Pendiente",
      ],
    ],
  );
  const pages = pdf.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    pdf.setPage(page);
    pdf.setDrawColor(225);
    pdf.line(14, 280, 196, 280);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    pdf.setTextColor(110);
    pdf.text(
      `ObraTrack | ${summary.fecha} | Revision ${summary.version}`,
      14,
      286,
    );
    pdf.text(`Pagina ${page} de ${pages}`, 196, 286, { align: "right" });
  }
  return pdf;
}
