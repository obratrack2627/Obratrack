/** Nonce CSP shared by the Edge guard and the server-rendered document. */
export function contentSecurityPolicy(nonce:string,development=false){
 const database=new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://gaoxbkvhtdsgqxjihlrv.supabase.co').origin;
 return ["default-src 'self'",`script-src 'self' 'nonce-${nonce}'${development?" 'unsafe-eval'":''} https://maps.googleapis.com https://*.googleapis.com`,"style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",`img-src 'self' data: blob: https: ${database}`,"font-src 'self' data: https://fonts.gstatic.com",`connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.googleapis.com ${database}${development?' ws: wss:':''}`,`frame-src 'self' https://www.google.com https://maps.google.com https://*.google.com ${database}`,"frame-ancestors 'self'","base-uri 'self'","form-action 'self'","object-src 'none'", "worker-src 'self'"].join('; ');
}
