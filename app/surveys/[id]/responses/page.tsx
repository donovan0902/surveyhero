import { ResponsesShell } from "@/components/responses/ResponsesShell";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function SurveyResponsesPage({ params }: Props) {
  const { id } = await params;
  return <ResponsesShell surveyId={id} />;
}
