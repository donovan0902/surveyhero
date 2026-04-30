import { RespondShell } from "@/components/respond/RespondShell";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function RespondPage({ params }: Props) {
  const { id } = await params;
  return <RespondShell surveyId={id} />;
}
