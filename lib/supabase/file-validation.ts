import sharp from 'sharp';
import { AIError } from '@/lib/ai/errors';
const office:Record<string,string>={
 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':'word/document.xml',
 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':'xl/workbook.xml',
};
const invalid=()=>new AIError('FILE_CONTENT','El contenido del archivo no coincide con su formato o está dañado. Selecciona una imagen, PDF, Word o Excel válido.',422);
export async function validateFileContent(bytes:Buffer,mime:string,photosOnly=false){
 if(!bytes.length)throw invalid();
 if(['image/jpeg','image/png','image/webp'].includes(mime)){
  try{
   const image=sharp(bytes,{limitInputPixels:20000000,failOn:'error'});
   const info=await image.metadata();
   if(info.format!==mime.slice(6).replace('jpg','jpeg') || (info.pages||1)>1)throw invalid();
   await image.stats();
   return;
  }catch{throw invalid();}
 }
 if(photosOnly)throw invalid();
 if(mime==='application/pdf'){
  if(bytes.subarray(0,5).toString()!=='%PDF-' || !bytes.subarray(Math.max(0,bytes.length-1024)).includes(Buffer.from('%%EOF')))throw invalid();
  return;
 }
 if(!office[mime])throw invalid();
 // Inspect bounded ZIP metadata without extracting user files or inflating a zip bomb.
 let end=-1;
 for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--)if(bytes.readUInt32LE(i)===0x06054b50){end=i;break;}
 if(end<0 || bytes.readUInt16LE(end+4)!==0 || bytes.readUInt16LE(end+6)!==0)throw invalid();
 const count=bytes.readUInt16LE(end+10),offset=bytes.readUInt32LE(end+16);let at=offset,total=0;const files=new Set<string>();
 if(count>2000 || offset>=end)throw invalid();
 for(let i=0;i<count;i++){
  if(at+46>end || bytes.readUInt32LE(at)!==0x02014b50)throw invalid();
  const size=bytes.readUInt32LE(at+24),nameLength=bytes.readUInt16LE(at+28),extra=bytes.readUInt16LE(at+30),comment=bytes.readUInt16LE(at+32);
  if(at+46+nameLength+extra+comment>end)throw invalid();
  const name=bytes.subarray(at+46,at+46+nameLength).toString('utf8');
  if(name.startsWith('/') || name.split(/[\\/]/).includes('..') || /vbaProject|\.exe$|\.js$/i.test(name))throw invalid();
  total+=size;if(total>100*1024*1024)throw invalid();files.add(name);at+=46+nameLength+extra+comment;
 }
 if(!files.has('[Content_Types].xml') || !files.has(office[mime]))throw invalid();
}
