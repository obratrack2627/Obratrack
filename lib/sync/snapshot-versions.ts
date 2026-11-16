import type { Snapshot } from '@/lib/ai/rows';
/** Attach server-read revisions after planning; model output never supplies these values. */
export function withSnapshotVersions(plan:{changed:Snapshot;deleted:Snapshot},tables:Record<string,any[]>){
 const attach=(snapshot:Snapshot):Snapshot=>Object.fromEntries(Object.entries(snapshot).map(([table,rows])=>{
  const before=new Map((tables[table]||[]).map(row=>[row.id,row.sync_version??null]));
  return [table,rows.map(row=>({...row,sync_version:before.get(row.id)??null}))];
 }));
 return {changed:attach(plan.changed),deleted:attach(plan.deleted)};
}
