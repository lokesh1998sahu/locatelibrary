// The Dashboard now lives inside Today: one money screen instead of two that
// had to agree. Old links and bookmarks land there.
import { redirect } from "next/navigation";

export default function DashboardMoved() {
  redirect("/lma960805/today");
}
