export function titleCase(name:string):string{
  return String(name||"").toLowerCase().replace(/\b\w/g, c=>c.toUpperCase());
}

function boldLib(library:string):string{
  return `*${String(library||"").toUpperCase()}*`;
}

// O12 — one builder, two messages (state-aware)
export function buildRenewReminder(name:string, library:string, dateStr:string, expired:boolean):string{
  const n = titleCase(name);
  const lib = boldLib(library);
  if (expired) {
    return `Hi ${n}, your seat at ${lib} expired on ${dateStr}. Please deposit the fees to renew, or reply here if you're not continuing. Thank you!`;
  }
  return `Hi ${n}, your seat at ${lib} is expiring on ${dateStr}. Please confirm if you'll continue — and if not, kindly let us know. Thank you!`;
}

// O13 — third reminder type (dues)
export function buildDuesReminder(name:string, library:string, balance:number):string{
  const n = titleCase(name);
  const lib = boldLib(library);
  return `Hi ${n}, a fee balance of ₹${balance} is pending on your seat at ${lib}. Kindly clear it at your earliest. Thank you!`;
}

// B5 — follow-up variant (second nudge after an earlier reminder)
export function buildRenewFollowUp(name:string, library:string, dateStr:string, expired:boolean):string{
  const n = titleCase(name);
  const lib = boldLib(library);
  if (expired) {
    return `Hi ${n}, we messaged earlier — your seat at ${lib} expired on ${dateStr}. Please update us: deposit the fees to renew, or let us know if you're not continuing. Thank you!`;
  }
  return `Hi ${n}, we messaged earlier about your seat at ${lib} expiring on ${dateStr}. Please update us on whether you'll continue. Thank you!`;
}