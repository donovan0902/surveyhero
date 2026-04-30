import { redirect } from "next/navigation";

export default function Home() {
  redirect("/surveys/demo/edit");
}
