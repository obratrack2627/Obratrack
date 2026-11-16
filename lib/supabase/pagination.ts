import { AIError } from '@/lib/ai/errors';

/** Read a complete, ordered set; a PostgREST response may be capped at 1,000 rows. */
export async function completeRows(query: () => any, order: string[] = ['id']) {
  const rows: any[] = [];
  const pageSize = 500;
  const seen=new Set<string>();
  for (let offset = 0; ; offset += pageSize) {
    let page = query();
    for (const column of order) page = page.order(column, { ascending: true });
    const result = await page.range(offset, offset + pageSize - 1);
    if (result.error) return result;
    if (!Array.isArray(result.data)) throw new AIError('DATABASE_READ', 'No se pudo comprobar la información recibida. Intenta nuevamente.', 503);
    for(const row of result.data){
      const key=row.id!=null?String(row.id):JSON.stringify(order.map(column=>row[column]));
      if(seen.has(key))throw new AIError('DATABASE_READ','Los datos cambiaron durante la carga. Actualiza la página e intenta nuevamente.',503);
      seen.add(key);
    }
    rows.push(...result.data);
    if (result.data.length < pageSize) return { data: rows, error: null };
    // Fail explicitly instead of silently truncating or looping on a broken proxy.
    if (rows.length >= 250000) throw new AIError('DATABASE_SCOPE', 'Consulta una obra o un período más acotado para cargar esta información.', 413);
  }
}

/** Keep PostgREST URLs bounded when a company has many projects. */
export async function completeProjectRows(client:any,table:string,ids:string[],order:string[]=['id']){
 const data:any[]=[];
 for(let offset=0;offset<ids.length;offset+=75){
  const chunk=ids.slice(offset,offset+75);
  const result=await completeRows(()=>client.from(table).select('*').in('proyecto_id',chunk),order);
  if(result.error)return result;
  data.push(...result.data);
 }
 return {data,error:null};
}
