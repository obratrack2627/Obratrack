import {createHash} from 'node:crypto';
import {deliverReplyOnce} from './reply-delivery';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { AIError } from "@/lib/ai/errors";
import { findBudget } from "@/lib/presupuestos";
import { canonicalPhone } from "@/lib/phone";
import { buildQuoteDocument, quoteMoney } from "@/lib/quotes/document";
import { createQuotePdf } from "@/lib/quotes/pdf";
import type { CotizacionEstimacion } from "@/types/database";
import { sendMetaDocument } from "./meta";

export async function buildQuotePdfBuffer(
  sb: any,
  params: {
    cotizacion: CotizacionEstimacion;
    empresaId: string;
    actor?: {
      nombre?: string;
      email?: string;
      telefono_whatsapp?: string;
      especialidades?: string[];
    } | null;
  },
) {
  const { cotizacion, empresaId, actor } = params;
  const [companyResult, clientResult] = await Promise.all([
    sb
      .from("empresas")
      .select("nombre,rut,logo_url,configuracion")
      .eq("id", empresaId)
      .maybeSingle(),
    cotizacion.cliente_id
      ? sb
          .from("clientes")
          .select("nombre,email,telefono")
          .eq("empresa_id", empresaId)
          .eq("id", cotizacion.cliente_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  const company = companyResult?.data || null;
  const savedClient = clientResult?.data || null;

  const doc = buildQuoteDocument(cotizacion, {
    clienteNombre: cotizacion.cliente_nombre ?? savedClient?.nombre,
    clienteEmail: cotizacion.cliente_email ?? savedClient?.email,
    clienteTelefono: cotizacion.cliente_telefono ?? savedClient?.telefono,
    emisor: {
      nombre: actor?.nombre,
      email: actor?.email,
      telefono_whatsapp: actor?.telefono_whatsapp,
      especialidades: actor?.especialidades,
      empresa_nombre: company?.nombre,
      empresa_rut: company?.rut ?? null,
      empresa_logo_url: company?.logo_url ?? null,
      empresa_configuracion: company?.configuracion,
    },
  });

  const pdf = createQuotePdf(doc);
  return {
    bytes: pdf.output("arraybuffer"),
    filename: doc.filename,
    caption: `Cotización aprobada · ${doc.proyecto.nombre} · Total ${quoteMoney(doc.total)}`,
  };
}

/** Genera el PDF oficial cuando se aprueba/convierte una cotización por WhatsApp. */
export async function quotePdfDocument(sb: any, receipt: any, to: string) {
  const action = receipt?.acciones;
  const budgetId = action?.presupuesto_seleccion_id || action?.presupuesto_cotizacion_id;
  if (!receipt?.persistido || typeof budgetId !== "string" || !budgetId) return null;

  const { data: actor, error: actorError } = await sb
    .from("usuarios")
    .select("id,empresa_id,rol,nombre,email,telefono_whatsapp,especialidades")
    .eq("id", receipt.actor_id)
    .eq("empresa_id", receipt.empresa_id)
    .maybeSingle();

  if (actorError)
    throw new AIError(
      "QUOTE_PDF_READ",
      "No se pudo preparar el PDF de la cotización.",
      503,
    );

  if (
    !actor ||
    !["admin", "supervisor"].includes(actor.rol) ||
    !canonicalPhone(to) ||
    canonicalPhone(actor.telefono_whatsapp || "") !== canonicalPhone(to)
  )
    throw new AIError(
      "QUOTE_PDF_FORBIDDEN",
      "El PDF de la cotización solo está disponible para la jefatura autorizada.",
      403,
    );

  const budget = await findBudget(sb, receipt.empresa_id, budgetId);
  if (!budget?.cotizacion || ['rechazada','anulada'].includes(budget.estado)) return null;
  const expectedProject=action.presupuesto_proyecto_id || action.proyecto_contexto_id;
  if(expectedProject && budget.proyecto_id && expectedProject!==budget.proyecto_id)
    throw new AIError('QUOTE_PDF_FORBIDDEN','La cotización no corresponde a la obra de esta conversación.',403);

  return buildQuotePdfBuffer(sb, {
    cotizacion: budget.cotizacion,
    empresaId: receipt.empresa_id,
    actor,
  });
}

/** Envía en mejor esfuerzo el PDF de la cotización aceptada desde la web al WhatsApp del usuario. */
export async function sendAcceptedQuotePdfToWhatsApp(
  sb: any,
  params: {
    user: { id: string; empresa_id: string; rol: string; nombre?: string };
    cotizacion: CotizacionEstimacion;
  },
): Promise<boolean> {
  if (
    !process.env.WHATSAPP_CLOUD_API_ACCESS_TOKEN ||
    !process.env.WHATSAPP_CLOUD_API_PHONE_NUMBER_ID
  )
    return false;
  if (!["admin", "supervisor"].includes(params.user.rol)) return false;
  try {
    const { data: actor } = await sb
      .from("usuarios")
      .select("id,nombre,email,telefono_whatsapp,especialidades")
      .eq("id", params.user.id)
      .eq("empresa_id", params.user.empresa_id)
      .maybeSingle();
    const phone = canonicalPhone(actor?.telefono_whatsapp || "");
    if (!phone) return false;
    const source=`web-quote:${params.cotizacion.id}:${createHash('sha256').update(JSON.stringify(params.cotizacion)).digest('hex')}`;
    const deliveryClient = getSupabaseAdmin() || sb;
    return await deliverReplyOnce(deliveryClient,{persistido:true,empresa_id:params.user.empresa_id,actor_id:params.user.id},source,'quote_pdf',async()=>{
    const doc = await buildQuotePdfBuffer(sb, {
      cotizacion: params.cotizacion,
      empresaId: params.user.empresa_id,
      actor: actor || params.user,
    });
    await sendMetaDocument(phone, doc.bytes, doc.filename, doc.caption);
    },false);
  } catch (error) {
    console.error("quote_whatsapp_pdf_failure", {
      message: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}
