import { redirect } from "next/navigation";
export default function FinanzasPage({ params }: { params: { id: string } }) {
  redirect(`/proyectos/${params.id}?vista=Estados%20de%20pago`);
}
