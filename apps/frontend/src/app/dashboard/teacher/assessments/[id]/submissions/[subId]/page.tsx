import { redirect } from 'next/navigation';

export default async function Redirect({
  params,
}: {
  params: Promise<{ id: string; subId: string }>;
}) {
  const { id, subId } = await params;
  redirect(`/teacher/assessments/${id}/submissions/${subId}`);
}