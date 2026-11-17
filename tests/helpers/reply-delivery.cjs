module.exports=()=>{
 const states=new Map();
 return async(name,p)=>{
  if(name==='whatsapp_reservar_respuesta'){
   const state=states.get(p.p_key);const claimed=!state||state==='failed';if(claimed)states.set(p.p_key,'sending');return {data:{claimed,accepted:state==='accepted'},error:null};
  }
  if(name==='whatsapp_finalizar_respuesta'){states.set(p.p_key,p.p_estado);return {data:null,error:null};}
  throw Error('Unexpected delivery RPC');
 };
};
