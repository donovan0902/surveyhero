import { BuilderShell } from "@/components/builder/BuilderShell";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function EditSurveyPage({ params }: Props) {
  const { id } = await params;
  return <BuilderShell surveyId={id} />;
}
