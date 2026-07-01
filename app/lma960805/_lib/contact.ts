export interface ContactPhone { number:string; tag:string; }
// Serialized contact label(s) for a student's saved numbers.
// 1 number → "Name Lib SID"; extra numbers → "Name Lib SID (2)" or "Name Lib SID (2) (FATHER)".
export function buildContactText(name:string, library:string, studentId:string, phones?:ContactPhone[]):string{
  const base=`${name} ${library} ${studentId}`.trim();
  const list=(phones||[]).filter(p=>p&&p.number);
  if(list.length<=1) return base;
  return list.map((p,i)=> i===0 ? base : `${base} (${i+1})`+(String(p.tag||"").trim()?` (${String(p.tag).trim().toUpperCase()})`:"")).join("\n");
}