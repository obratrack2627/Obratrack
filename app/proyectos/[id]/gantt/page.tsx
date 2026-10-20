import { redirect } from "next/navigation";
export default function GanttPage({ params }: { params: { id: string } }) {
  redirect(`/proyectos/${params.id}?vista=Actividades`);
}
