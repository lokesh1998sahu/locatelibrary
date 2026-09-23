"use client";

// LMA — Vacant seats on its own screen (the bolt button). Pick a library, pick
// the plans, get the text to send. It uses the same shared component as before,
// which reads the live board and the same vacancy rules as the seat chart.

import { useState } from "react";
import { useScopeChips } from "../_components/LMAProvider";
import VacantSeats from "../_components/VacantSeats";
import { Screen, TopBar, Card, Empty, ScopeChips, BASE } from "../_ui/kit";
import { IconSeat } from "../_ui/icons";

export default function VacantSeatsPage() {
  const chips = useScopeChips({ includeAll: false });   // the list is always for one library
  const [scope, setScope] = useState("");

  return (
    <Screen>
      <TopBar back={BASE + "/board"} title="Vacant seats" sub="The free-seat list to send out" />
      <ScopeChips chips={chips} value={scope} onChange={setScope} />
      {scope
        ? <VacantSeats scope={scope} />
        : <Card><Empty icon={<IconSeat size={22} />} title="Pick a library"
            body="Choose one above, then the plans you want. The list is read from the live board each time." /></Card>}
    </Screen>
  );
}
