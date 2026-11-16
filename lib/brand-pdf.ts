import type { jsPDF } from 'jspdf';

const BRAND_ORANGE = '#FF6201';
const BRAND_NAVY = '#222A37';
const BRAND_GREEN = '#688868';
const BRAND_GRAY = '#666666';

function fillPolygon(pdf: jsPDF, x: number, y: number, scale: number, points: [number, number][], color: string) {
  const vectors: [number, number][] = [];
  for (let i = 1; i < points.length; i += 1) {
    vectors.push([points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]]);
  }
  pdf.setFillColor(color);
  pdf.lines(vectors, x + points[0][0] * scale, y + points[0][1] * scale, [scale, scale], 'F', true);
}

/**
 * Dibuja el isotipo vectorial oficial de ObraTrack sobre papel claro (sin depender de imágenes externas).
 * Mantiene la geometría del viewBox 140x130 escalada por `scale` (0.1 => 14x13 mm).
 */
export function drawObraTrackMark(
  pdf: jsPDF,
  x: number,
  y: number,
  scale = 0.1,
  theme: 'light' | 'dark' = 'light',
  holeColor = theme === 'dark' ? '#141A23' : '#FFFFFF',
) {
  const buildingsColor = theme === 'dark' ? '#FFFFFF' : BRAND_NAVY;
  // 1. Casa exterior naranja
  fillPolygon(
    pdf,
    x,
    y,
    scale,
    [
      [19.59, 89.65],
      [19.59, 38.12],
      [65.21, 6.0],
      [101.79, 31.44],
      [101.79, 41.92],
      [65.21, 17.28],
      [28.37, 43.24],
      [28.37, 89.65],
    ],
    BRAND_ORANGE,
  );

  // 2. Barra horizontal biselada y anillo circular izquierdo
  fillPolygon(
    pdf,
    x,
    y,
    scale,
    [
      [34.0, 108.0],
      [70.07, 108.0],
      [77.93, 116.4],
      [34.0, 116.4],
    ],
    BRAND_ORANGE,
  );
  pdf.setFillColor(BRAND_ORANGE).circle(x + 25.03 * scale, y + 112.46 * scale, 11.6 * scale, 'F');
  pdf.setFillColor(holeColor).circle(x + 25.03 * scale, y + 112.46 * scale, 4.85 * scale, 'F');

  // 3. Tres columnas centrales (oscuras sobre fondo claro / blancas sobre negro)
  fillPolygon(
    pdf,
    x,
    y,
    scale,
    [
      [41.48, 102.76],
      [41.48, 61.59],
      [55.51, 53.72],
      [55.51, 102.76],
    ],
    buildingsColor,
  );
  fillPolygon(
    pdf,
    x,
    y,
    scale,
    [
      [60.36, 96.99],
      [60.36, 35.89],
      [63.38, 34.45],
      [77.67, 43.76],
      [77.67, 87.94],
      [75.18, 86.37],
      [63.9, 96.99],
    ],
    buildingsColor,
  );
  fillPolygon(
    pdf,
    x,
    y,
    scale,
    [
      [82.26, 91.62],
      [82.26, 57.92],
      [84.36, 57.0],
      [96.29, 65.13],
      [96.29, 85.85],
      [86.19, 95.16],
    ],
    buildingsColor,
  );

  // 4. Checkmark verde
  fillPolygon(
    pdf,
    x,
    y,
    scale,
    [
      [69.67, 98.56],
      [75.83, 92.4],
      [86.45, 103.02],
      [126.31, 64.08],
      [126.31, 76.41],
      [86.45, 115.22],
    ],
    BRAND_GREEN,
  );
}

export function drawObraTrackWordmarkPdf(pdf: jsPDF, x: number, y: number, subtitle?: string) {
  drawObraTrackMark(pdf, x, y, 0.1);
  pdf.setFont('helvetica', 'bold').setFontSize(19).setTextColor('#FF6A00');
  pdf.text('Obra', x + 15, y + 8.7);
  const wordWidth = pdf.getTextWidth('Obra');
  pdf.setTextColor(BRAND_NAVY).text('Track', x + 15 + wordWidth, y + 8.7);
  pdf.setFont('helvetica', 'normal').setFontSize(4.9).setTextColor(BRAND_GRAY);
  const caption = pdf.splitTextToSize(subtitle || 'CONTROL · COTIZACIONES · COSTOS · PAGOS · AVANCES', 105)[0] || '';
  pdf.text(caption, x + 15, y + 12);
}
