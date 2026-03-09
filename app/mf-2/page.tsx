"use client"

import { useState, useEffect } from "react"

export default function FinanceAccess(){

const PASSWORD = process.env.NEXT_PUBLIC_FINANCE_PASSWORD

const [authorized,setAuthorized] = useState(false)
const [passwordInput,setPasswordInput] = useState("")
const [message,setMessage] = useState("")

useEffect(()=>{

const saved = localStorage.getItem("financeAuthorized")

if(saved==="true"){
window.location.href="/mf-2/dashboard"
}

},[])

function checkPassword(){

if(passwordInput===PASSWORD){

localStorage.setItem("financeAuthorized","true")

window.location.href="/mf-2/dashboard"

}else{

setMessage("Incorrect Password")

setTimeout(()=>setMessage(""),2000)

}

}

return(

<div className="finance-page">

<div className="finance-card">

<div className="finance-title">
            My Financials 2.0 - Access Panel
            </div>

{message && (

<div style={{
background:"#ffe5e5",
padding:"8px",
borderRadius:6,
marginBottom:10,
textAlign:"center",
color:"#b00020"
}}>
{message}
</div>

)}

<input
type="password"
placeholder="Enter Access Password"
value={passwordInput}
onChange={(e)=>setPasswordInput(e.target.value)}
className="finance-input"
style={{width:"100%"}}
/>

<button
onClick={checkPassword}
className="finance-button"
style={{marginTop:12,width:"100%"}}
>
Access
</button>

</div>

</div>

)

}