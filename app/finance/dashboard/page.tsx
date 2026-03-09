"use client"

import { useEffect} from "react";


export default function FinanceDashboard(){


        useEffect(()=>{
        const auth = localStorage.getItem("financeAuthorized")
    
        if(auth!=="true"){
        window.location.href="/finance"
        }
        },[])
    

return(

<div className="finance-page">

<div className="finance-card">

            <div style={{
            position:"relative",
            textAlign:"center"
            }}>

            <div className="finance-title">
            My Financials 2.0
            </div>

            <button
            onClick={()=>{
            localStorage.removeItem("financeAuthorized")
            window.location.href="/finance"
            }}
            style={{
            position:"absolute",
            right:0,
            top:0,
            fontSize:15,
            border:"none",
            background:"transparent",
            color:"#b00020",
            cursor:"pointer"
            }}
            >
            Logout
            </button>

            </div> 


<div style={{
display:"flex",
flexDirection:"column",
gap:16,
marginTop:20
}}>

<button
onClick={()=>window.location.href="/finance/add"}
style={cardStyle}
>
Add Entry
</button>

<button
onClick={()=>window.location.href="/finance/ledger"}
style={cardStyle}
>
Ledger
</button>

<button
onClick={()=>window.location.href="/finance/masters"}
style={cardStyle}
>
Masters
</button>

</div>

</div>

</div>

)
}

const cardStyle:any={

padding:"18px",
borderRadius:14,
border:"1px solid #ddd",
background:"#fff",
fontSize:18,
fontWeight:600,
cursor:"pointer",
boxShadow:"0 4px 14px rgba(0,0,0,0.08)"


}