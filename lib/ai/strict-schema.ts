type Schema = Record<string, any>;

// Structured Outputs exige todas las propiedades como requeridas. Las que eran
// opcionales admiten null y se omiten de nuevo antes del protocolo de negocio.
export function strictOutputSchema(schema: Schema): Schema {
  const result = { ...schema };
  if (schema.properties) {
    const required = new Set(schema.required || []);
    result.properties = Object.fromEntries(Object.entries(schema.properties as Record<string, Schema>).map(([key, child]) => {
      const converted = strictOutputSchema(child);
      const nullable = child.type === 'null' || (Array.isArray(child.type) && child.type.includes('null'));
      return [key, required.has(key) || nullable ? converted : { anyOf: [converted, { type: 'null' }] }];
    }));
    result.required = Object.keys(schema.properties);
    result.additionalProperties = false;
  }
  if (schema.items) result.items = strictOutputSchema(schema.items);
  if (schema.anyOf) result.anyOf = schema.anyOf.map(strictOutputSchema);
  return result;
}
export function restoreOptionalFields(value: any, schema: Schema): any {
  if (value == null) return value;
  if (Array.isArray(value)) return value.map((item) => restoreOptionalFields(item, schema.items || {}));
  if (typeof value !== 'object' || !schema.properties) return value;
  const required = new Set(schema.required || []);
  return Object.fromEntries(Object.entries(value).filter(([key, item]) => item !== null || required.has(key)).map(([key, item]) => [key, restoreOptionalFields(item, schema.properties[key] || {})]));
}
