import {NextRequest,NextResponse} from 'next/server';
import {authorizeAI,errorJSON} from '@/lib/ai/server';
import {scheduleQualityEvent} from '@/lib/ai/quality-server';
export async function POST(request:NextRequest){try{
 const {client,user}=await authorizeAI(request);const body=await request.json();
 if(!['action_cancelled','execution_failure'].includes(body.kind))return NextResponse.json({error:'Evento no admitido.'},{status:422});
 scheduleQualityEvent(client,user,{kind:body.kind,code:body.kind==='action_cancelled'?'ACTION_CANCELLED':'EXECUTION_FAILED'});
 return NextResponse.json({ok:true},{status:202});
}catch(error){return errorJSON(error);}}
