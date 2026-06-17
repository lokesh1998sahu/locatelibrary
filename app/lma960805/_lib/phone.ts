// Normalize any pasted/typed phone format to the exact Indian 10-digit number.
// Strips spaces/dashes/dots/brackets and +91 / 0091 / 91 / leading-0 trunk prefixes.
export function parsePhone10(raw:string):string{
  let c=String(raw||"").replace(/\D/g,"");            // digits only
  if(c.length>10){
    if(c.length===12 && c.startsWith("91")) c=c.slice(2);        // 91XXXXXXXXXX
    else if(c.length===13 && c.startsWith("091")) c=c.slice(3);  // 091XXXXXXXXXX
    else if(c.length===11 && c.startsWith("0")) c=c.slice(1);    // 0XXXXXXXXXX
    else c=c.slice(-10);                                          // any other prefix → last 10
  }
  return c.slice(0,10);
}