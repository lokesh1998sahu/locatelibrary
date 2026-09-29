// Old address. The money screen is the Dashboard now (/lma960805/dashboard);
// this only forwards old bookmarks and home-screen shortcuts. Nothing in the
// app links here any more — delete this folder if you never use the old link.
import { redirect } from "next/navigation";

export default function TodayMoved() {
  redirect("/lma960805/dashboard");
}
