export type QuoteLineKind = 'partida' | 'material';

const foldText = (text: string) =>
  String(text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

const PARTIDA_RE =
  /\b(?:instalacion|colocacion|demolicion|excavacion|retiro|escombro|escombros|mano de obra|obra de mano|maestro|jornal|pintado|empastado|estuco|enlucido|preparacion|nivelacion|hormigonado|hormigon estampado|pavimento|radier|tabiqueria|revestimiento|techumbre|cielo raso|electricidad|gasfiteria|conexion|red de agua|red electrica|sanitaria|alcantarillado|agua potable|terminacion|terminaciones|logia|piso deck|corta vista|cobertizo|porton|reja|cierro|cerco|remodelacion|ampliacion|reparacion|mantencion|flete|transporte|despacho|traslado|acarreo|armado|montaje|sellado|impermeabilizacion|alcance completo|servicio|trabajo|partida|ejecucion|construccion|fabricacion|realizacion|hechura|confeccion)\b/i;

const MATERIAL_UNIT_SET = new Set([
  'saco',
  'sacos',
  'caja',
  'cajas',
  'galon',
  'galones',
  'tarro',
  'tarros',
  'tineta',
  'tinetas',
  'plancha',
  'planchas',
  'tira',
  'tiras',
  'rollo',
  'rollos',
  'barra',
  'barras',
  'bolsa',
  'bolsas',
  'kg',
  'kilo',
  'kilos',
  'litro',
  'litros',
  'lt',
  'lts',
  'm3',
  'm³',
  'mts cubicos',
  'metro cubico',
  'metros cubicos',
]);

const MATERIAL_RE =
  /\b(?:cemento|arena|ripio|grava|malla|fibra|liston|listones|topex|latex|esmalte|adhesivo|bekron|frague|porcelanato|ceramica|ceramico|plancha|planchas|caballete|caballetes|poste|postes|tabla|tablas|perfil|tubular|fierro|acero|clavo|clavos|tornillo|tornillos|silicona|pasta muro|yeso|volcanita|osb|terciado|pino|madera|caneria|tuberia|cable|enchufe|interruptor|llave|griferia|inodoro|lavamanos|zinc|policarbonato|adoquin|adoquines|ladrillo|bloque|puerta|ventana|pintura|sellador|imprimante|insumo|material|viga|wpc|canal|cerradura|anticorrosivo|brocha|rodillo|soldadura|disco|discos|prelaminado|electrodo|lija|bisagra|pasador|chapa|tuerca|perno|golilla|tarugo|anclaje|diluyente|aguarras|barniz)\b/i;

export function classifyQuoteLineKind(name: string, unidad?: string): QuoteLineKind {
  const foldedName = foldText(name);
  if (!foldedName) return 'partida';
  if (PARTIDA_RE.test(foldedName) || /^pintura\s+(?:de|y\s+terminaci|cielo|muro|muros|fachada|interior|exterior|puerta|reja)\b/.test(foldedName)) {
    return 'partida';
  }
  const foldedUnit = foldText(unidad || '').replace(/\./g, '');
  if (foldedUnit && MATERIAL_UNIT_SET.has(foldedUnit)) {
    return 'material';
  }
  if (MATERIAL_RE.test(foldedName)) {
    return 'material';
  }
  return 'partida';
}

export function resolveSaleLineKind(line: {
  nombre: string;
  unidad?: string;
  tipo?: 'partida' | 'material';
}): QuoteLineKind {
  if (line.tipo === 'material' || line.tipo === 'partida') {
    return line.tipo;
  }
  return classifyQuoteLineKind(line.nombre, line.unidad);
}
