export interface ContactPhone { number:string; tag:string; }
export interface ContactLabel { label:string; number:string; tag:string; }
export function contactLabels(name:string, library:string, studentId:string, phones?:ContactPhone[]):ContactLabel[]{
  const base=`${name} ${library} ${studentId}`.trim();
  const list=(phones||[]).filter(p=>p&&p.number);
  if(list.length===0) return [{label:base, number:"", tag:""}];
  return list.map((p,i)=>({
    label: i===0 ? base : `${base} (${i+1})`+(String(p.tag||"").trim()?` (${String(p.tag).trim().toUpperCase()})`:""),
    number: p.number,
    tag: String(p.tag||"").trim()
  }));
}