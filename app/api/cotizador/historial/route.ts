import {NextRequest,NextResponse} from 'next/server';
import {authorizeAI,errorJSON} from '@/lib/ai/server';
import {syncChat,readOlderChat} from '@/lib/ai/chat-history-server';
import {AIError} from '@/lib/ai/errors';
export const dynamic='force-dynamic';
export async function GET(request:NextRequest){try{const {client,user}=await authorizeAI(request);const before=request.nextUrl.searchParams.get('before');return NextResponse.json(before?await readOlderChat(client,user,before,request.nextUrl.searchParams.get('before_id')||''):await syncChat(client,user));}catch(error){return errorJSON(error);}}
export async function POST(request:NextRequest){try{
 const {client,user}=await authorizeAI(request);const raw=await request.text();if(raw.length>1000000)throw new AIError('CHAT_INVALID','La conversación es demasiado extensa.',413);
 let body:any;try{body=JSON.parse(raw);}catch{throw new AIError('CHAT_INVALID','El historial no tiene un formato válido.',400);}return NextResponse.json(await syncChat(client,user,{version:body.version,messages:body.messages,reset:body.reset===true}));
}catch(error){return errorJSON(error);}}
