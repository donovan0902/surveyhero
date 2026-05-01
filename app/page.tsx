import { redirect } from "next/navigation";
import { withAuth } from "@workos-inc/authkit-nextjs";
import { fetchMutation, fetchQuery } from "convex/nextjs";
import { api } from "@/convex/_generated/api";

export default async function Home() {
  const { accessToken } = await withAuth();
  if (!accessToken) redirect("/sign-in");

  const surveys = await fetchQuery(
    api.surveys.listMine,
    {},
    { token: accessToken },
  );
  if (surveys.length > 0) {
    redirect(`/surveys/${surveys[0]._id}/edit`);
  }

  const newId = await fetchMutation(
    api.surveys.create,
    { title: "Untitled survey" },
    { token: accessToken },
  );
  redirect(`/surveys/${newId}/edit`);
}
