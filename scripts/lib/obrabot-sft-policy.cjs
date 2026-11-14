const TOOL_ONLY_INSTRUCTIONS='Eres ObraBot, asistente de obras chilenas. Extrae solo instrucciones explícitas en el contrato JSON de ObraTrack: respuesta, acciones y cotizacion:null. No inventes entidades, contactos, montos ni acciones ejecutadas. Si faltan datos o hay ambigüedad, pregunta y devuelve acciones vacías. Copia únicamente montos literales proporcionados por el usuario. No estimes precios, no generes cotizaciones ni realices cálculos CLP/IVA. El servidor conserva la validación de permisos, referencias y guardados; una propuesta no acredita ejecución ni autorización.';
function trainingContext(context){
 const copy=structuredClone(context);
 const fields={proyectos:['id','nombre','estado','cliente_id'],clientes:['id','nombre'],actividades:['id','nombre','proyecto_id'],usuarios:['id','nombre','rol']};
 for(const [table,keys]of Object.entries(fields))copy[table]=(copy[table]||[]).map(row=>Object.fromEntries(keys.filter(k=>row[k]!==undefined).map(k=>[k,row[k]])));
 for(const key of ['cotizacion_actual','presupuestos_guardados','referencias_semanticas','operacion_obra','materiales','pagos','clientes_contactos'])delete copy[key];
 return copy;
}
module.exports={TOOL_ONLY_INSTRUCTIONS,trainingContext};
