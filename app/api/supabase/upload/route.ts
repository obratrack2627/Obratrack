import { NextRequest, NextResponse } from 'next/server';
import { uploadBufferToSupabaseStorage } from '@/lib/supabase/admin';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const bucketParam = (formData.get('bucket') as string) || 'documentos-obra';
    const proyectoId = (formData.get('proyectoId') as string) || 'general';

    if (!file) {
      return NextResponse.json({ error: 'No se recibió ningún archivo.' }, { status: 400 });
    }

    const bucket: 'documentos-obra' | 'bitacora-fotos' =
      bucketParam === 'bitacora-fotos' ? 'bitacora-fotos' : 'documentos-obra';

    const safeFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const safeProj = proyectoId.replace(/[^a-zA-Z0-9_-]/g, '_');
    const filePath = `${safeProj}/${Date.now()}_${safeFileName}`;

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const mimeType = file.type || 'application/octet-stream';

    const { publicUrl, error } = await uploadBufferToSupabaseStorage({
      bucket,
      filePath,
      buffer,
      contentType: mimeType,
    });

    if (!publicUrl || error) {
      return NextResponse.json(
        { error: error || 'Error subiendo archivo a Supabase Storage.' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      publicUrl,
      fileName: file.name,
      fileSize: file.size,
      mimeType,
      bucket,
      filePath,
    });
  } catch (err: any) {
    console.error('Error en /api/supabase/upload:', err);
    return NextResponse.json(
      { error: err.message || 'Error interno al subir archivo.' },
      { status: 500 }
    );
  }
}
