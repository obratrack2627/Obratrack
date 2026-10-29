import { NextRequest, NextResponse } from "next/server";
import { uploadBufferToSupabaseStorage } from "@/lib/supabase/admin";
import { authorizeAI, errorJSON } from "@/lib/ai/server";
import { AIError } from "@/lib/ai/errors";

export async function POST(request: NextRequest) {
  try {
    const { client, user } = await authorizeAI(request);
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const bucketParam = (formData.get("bucket") as string) || "documentos-obra";
    const proyectoId = (formData.get("proyectoId") as string) || "general";

    if (!file) {
      return NextResponse.json(
        { error: "No se recibió ningún archivo." },
        { status: 400 },
      );
    }
    if (file.size > 10 * 1024 * 1024)
      throw new AIError(
        "FILE_SIZE",
        "El archivo debe ocupar hasta 10 MB.",
        413,
      );
    const { data: project, error: projectError } = await client
      .from("proyectos")
      .select("id")
      .eq("empresa_id", user.empresa_id)
      .eq("id", proyectoId)
      .maybeSingle();
    if (projectError || !project)
      throw new AIError(
        "PROJECT_FORBIDDEN",
        "La obra no está disponible para tu cuenta.",
        403,
      );
    if (user.rol === "terreno") {
      const { data, error } = await client
        .from("proyecto_trabajadores")
        .select("usuario_id")
        .eq("proyecto_id", proyectoId)
        .eq("usuario_id", user.id)
        .maybeSingle();
      if (error || !data)
        throw new AIError(
          "PROJECT_FORBIDDEN",
          "Solo puedes subir archivos a tus obras asignadas.",
          403,
        );
    }

    const bucket: "documentos-obra" | "bitacora-fotos" =
      bucketParam === "bitacora-fotos" ? "bitacora-fotos" : "documentos-obra";
    if (
      bucket === "bitacora-fotos" &&
      !["image/jpeg", "image/png", "image/webp"].includes(file.type)
    )
      throw new AIError(
        "IMAGE_FORMAT",
        "Selecciona una foto JPG, PNG o WebP.",
        422,
      );

    const safeFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const safeProj = proyectoId.replace(/[^a-zA-Z0-9_-]/g, "_");
    const filePath = `${user.empresa_id}/${safeProj}/${crypto.randomUUID()}_${safeFileName}`;

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const mimeType = file.type || "application/octet-stream";

    const { publicUrl, error } = await uploadBufferToSupabaseStorage({
      bucket,
      filePath,
      buffer,
      contentType: mimeType,
    });

    if (!publicUrl || error) {
      return NextResponse.json(
        { error: error || "Error subiendo archivo a Supabase Storage." },
        { status: 500 },
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
    return errorJSON(err);
  }
}
