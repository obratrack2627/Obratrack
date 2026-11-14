import type {MensajeChatCotizador} from '@/types/database';
type Snapshot={version:number;messages:MensajeChatCotizador[];conflict?:boolean;has_more?:boolean};
type Cache={version:number|null;reset_pending:boolean};
export function mergeChatHistory(remote:MensajeChatCotizador[],local:MensajeChatCotizador[]){
 const rows=new Map<string,MensajeChatCotizador>();
 for(const row of [...local,...remote])if(row?.id)rows.set(row.id,row);
 return Array.from(rows.values()).map((row,index)=>({row,index})).sort((a,b)=>{
  const left=Date.parse(a.row.created_at||''),right=Date.parse(b.row.created_at||'');
  return Number.isFinite(left)&&Number.isFinite(right)?left-right||a.index-b.index:a.index-b.index;
 }).map(x=>x.row);
}
export class CloudChatHistory{
 private cache:Cache;private queue:Promise<void>=Promise.resolve();private ready=false;private revision=0;
 constructor(private deps:{read:()=>MensajeChatCotizador[];write:(rows:MensajeChatCotizador[],state?:Cache)=>void;readCache:()=>Cache;writeCache:(cache:Cache)=>void;request:(method:'GET'|'POST',body?:any)=>Promise<Snapshot>;active:()=>boolean;status?:(state:'synced'|'pending')=>void}){this.cache=deps.readCache();}
 private general(){return this.deps.read().filter(m=>!m.obra_contexto_id);}
 private apply(snapshot:Snapshot,discardLocal=false){
  if(!this.deps.active())return;
  const project=this.deps.read().filter(m=>!!m.obra_contexto_id);
  const rows=discardLocal?snapshot.messages:mergeChatHistory(snapshot.messages,this.general());
  this.cache={version:snapshot.version,reset_pending:false};this.deps.write([...project,...rows],this.cache);this.deps.writeCache(this.cache);this.deps.status?.('synced');
 }
 async initialize(){
  const revision=this.revision;
  try{
   const snapshot=await this.deps.request('GET');if(!this.deps.active()||revision!==this.revision)return;
   if(this.cache.reset_pending&&(this.cache.version===null||this.cache.version===snapshot.version)){
    const reset=await this.deps.request('POST',{version:snapshot.version,messages:[],reset:true});if(revision===this.revision)this.apply(reset,true);
   }else{
    const stale=this.cache.version===null?snapshot.version>0:this.cache.version!==snapshot.version;
    this.apply(snapshot,stale);
   }
  }catch{this.deps.status?.('pending');}
  this.ready=true;
 }
 sync(){
  this.queue=this.queue.catch(()=>undefined).then(async()=>{
   if(!this.deps.active())return;
   if(!this.ready||this.cache.version===null)await this.initialize();
   if(this.cache.version===null||!this.deps.active())return;
   const revision=this.revision;
   const reset=this.cache.reset_pending;
   const rows=this.general().filter(m=>!m.id.startsWith('m-init')).map(m=>{const {cotizacion_generada,pendiente_sincronizacion,...rest}=m;return {...rest,...(cotizacion_generada?.id?{cotizacion_id:cotizacion_generada.id}:{})};});
   const batches:any[][]=[[]];let size=0;
   for(const row of reset?[]:rows){const length=JSON.stringify(row).length;if(batches.at(-1)!.length>=100||size+length>400000){batches.push([]);size=0;}batches.at(-1)!.push(row);size+=length;}
   for(const batch of batches){
    const response=await this.deps.request('POST',{version:this.cache.version,messages:batch,reset});
    if(revision!==this.revision||!this.deps.active())return;
    this.apply(response,response.conflict===true||reset);
    if(response.conflict||reset)break;
   }
  }).catch(()=>{if(this.deps.active())this.deps.status?.('pending');});
  return this.queue;
 }
 async older(){
  const revision=this.revision;
  const oldest=this.general().filter(m=>m.created_at&&Number.isFinite(Date.parse(m.created_at))).sort((a,b)=>Date.parse(a.created_at!)-Date.parse(b.created_at!)||a.id.localeCompare(b.id))[0];
  if(!oldest||!this.deps.active())return false;
  const snapshot=await this.deps.request('GET',{before:oldest.created_at,before_id:oldest.id});
  if(!this.deps.active()||revision!==this.revision)return false;
  if(snapshot.version!==this.cache.version){await this.initialize();return false;}
  this.apply(snapshot);return snapshot.has_more===true;
 }
 reset(){
  this.revision++;
  this.cache.reset_pending=true;this.deps.writeCache(this.cache);
  return this.sync();
 }
}
