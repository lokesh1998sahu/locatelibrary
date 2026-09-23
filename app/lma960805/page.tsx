// LMA opens on the seat chart: that is where almost every job is done.
// Anything bookmarked to /lma960805 lands there too. "Today" (collection,
// alerts, occupancy, vacant seats) lives at /lma960805/today, in More.
import { redirect } from "next/navigation";

export default function LmaEntry() {
  redirect("/lma960805/board");
}
