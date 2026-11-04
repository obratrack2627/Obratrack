// Proveedor Auth local para Playwright: nunca forma parte de la aplicación ni usa cuentas reales.
const http=require('node:http');
const ownerId='00000000-0000-0000-0000-000000000001';
http.createServer((request,response)=>{
 response.setHeader('Content-Type','application/json');
 response.setHeader('Access-Control-Allow-Origin','*');response.setHeader('Access-Control-Allow-Headers','*');
 if(request.method==='OPTIONS'){response.end();return;}
 const token=(request.headers.authorization||'').slice(7);let payload;
 try {const parts=token.split('.');if(parts[2]!=='fixture-signature')throw Error('Token');payload=JSON.parse(Buffer.from(parts[1],'base64').toString());if(payload.sub!==ownerId||payload.exp<Date.now()/1000)throw Error('Token');}
 catch {response.statusCode=401;response.end(JSON.stringify({message:'Invalid fixture token'}));return;}
 const url=new URL(request.url,'http://localhost:3101');
 if(url.pathname==='/auth/v1/user'){response.end(JSON.stringify({id:ownerId,email:'owner@example.test',aud:'authenticated',role:'authenticated'}));return;}
 if(url.pathname==='/rest/v1/usuarios'){
  const user={id:ownerId,auth_user_id:ownerId,empresa_id:'fixture-company',nombre:'Contratista de prueba',email:'owner@example.test',rol:payload.web_role||'admin',is_dev:payload.dev===true};
  response.end(JSON.stringify(request.headers.accept?.includes('vnd.pgrst.object')?user:[user]));return;
 }
 response.end(JSON.stringify([]));
}).listen(3101,'127.0.0.1');
