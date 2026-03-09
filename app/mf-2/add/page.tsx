"use client";

import { useEffect, useState, useRef } from "react";

const API="/api/ledger";

export default function AddEntryPage(){

    const [engine,setEngine]=useState("transaction")
    const [masters,setMasters]=useState<any>(null)

    const [sheet,setSheet]=useState("")
    const [type,setType]=useState("")
    const [tag,setTag]=useState("")
    const [name,setName]=useState("")
    const [head,setHead]=useState("")

    const [amount,setAmount]=useState("")
    const [date,setDate]=useState("")
    const [description,setDescription]=useState("")

    const [fromTag,setFromTag]=useState("")
    const [toTag,setToTag]=useState("")

    const [mainSheet,setMainSheet]=useState("")
    const [mainType,setMainType]=useState("")
    const [mainName,setMainName]=useState("")

    const [ncSheet,setNcSheet]=useState("")
    const [ncType,setNcType]=useState("")
    const [ncName,setNcName]=useState("")

    const isWriteoff = type?.toUpperCase().includes("WRITEOFF")
    const isTransferred = type==="TRANSFERRED"
    const isNotional = type?.toUpperCase().includes("NOTIONAL")

    const [saving,setSaving] = useState(false)

    const [toast,setToast] = useState("")

    const amountRef = useRef<HTMLInputElement>(null)


    useEffect(()=>{
    const auth = localStorage.getItem("financeAuthorized")

    if(auth!=="true"){
    window.location.href="/mf-2"
    }
    },[])
    
    useEffect(()=>{

        fetch(API,{
            method:"POST",
            headers:{ "Content-Type":"application/json"},
            body:JSON.stringify({action:"master"})
            })
            .then(r=>r.json())
            .then(d=>{

            console.log("MASTER API RESPONSE:", d)

            if(d && d.status==="success"){
            setMasters(d)
            }else{
            alert("Master API failed")
            }

            })
            .catch((err)=>{
            console.log("MASTER API ERROR:", err)
            alert("API connection failed")
            })

    },[])


    useEffect(()=>{

        const saved = localStorage.getItem("duplicateEntry")

        if(!saved) return

        const data = JSON.parse(saved)

        setSheet(data.sheet || "")
        setHead(data.head || "")
        setName(data.name || "")
        setType(data.type || "")
        setTag(data.tag || "")
        setAmount(data.amount || "")
        setDescription(data.description || "")

        localStorage.removeItem("duplicateEntry")

        },[])


    if(!masters){

        return(

        <div style={{
        position:"fixed",
        top:0,
        left:0,
        width:"100%",
        height:"100%",
        background:"rgba(0,0,0,0.5)",
        display:"flex",
        alignItems:"center",
        justifyContent:"center",
        zIndex:999
        }}>
            

       <div style={{
            background:"#fff",
            padding:"20px 30px",
            borderRadius:12,
            display:"flex",
            flexDirection:"column",
            alignItems:"center",
            gap:12,
            boxShadow:"0 6px 18px rgba(0,0,0,0.2)"
            }}>

            <div style={{
            width:26,
            height:26,
            border:"4px solid #111",
            borderTop:"4px solid transparent",
            borderRadius:"50%",
            animation:"spin 1s linear infinite"
            }}></div>

            <div style={{
            fontSize:15,
            fontWeight:500,
            color:"#111"
            }}>
            Loading data...
            </div>

            </div>

        </div>

        )

    }

    const sheets = Object.keys(masters.names)
    const tags = masters.tags || []
    const names = masters.names[sheet]

    const allTypes = sheet ? (masters.types[sheet] || []) : []

    const types =
        engine==="transaction"
        ? allTypes.filter((t:any)=>{
        const m = String(t.mode).toUpperCase()
        return m==="CASH" || m==="WRITEOFF" || m==="NOTIONAL"
        })
        : engine==="adjustment"
        ? allTypes.filter((t:any)=>{
        const m = String(t.mode).toUpperCase()
        return m==="NON-CASH"
        })
    : []

    function resetCommon(){
        setAmount("")
        setDate("")
        setDescription("")
    }

    function dateInput(value:any,setter:any){

    return(

            <div style={{
            display:"flex",
            gap:6
            }}>

            <input
            type="date"
            value={value}
            onChange={e=>setter(e.target.value)}
            style={{
            padding:"10px",
            border:"1px solid #ccc",
            borderRadius:8,
            flex:1,
            fontSize:15,
            cursor:"pointer"
            }}
            onClick={(e:any)=>e.target.showPicker?.()}
            />

            <button
            type="button"
            onClick={()=>{
            const today = new Date().toISOString().split("T")[0]
            setter(today)
            }}
            style={{
            padding:"10px 12px",
            borderRadius:6,
            border:"1px solid #ccc",
            background:"#111",
            color:"#fff",
            cursor:"pointer"
            }}
            >
            Today
            </button>

            </div>

    )

    }

    /* ================= TRANSACTION ================= */

    async function submitTransaction(){

                if(saving) return
            setSaving(true)

            if(!sheet || !name || !type || !date || !amount){
            alert("Please fill all required fields")
            setSaving(false)
            return
            }

            const res = await fetch(API,{
            method:"POST",
            headers:{ "Content-Type":"application/json"},
            body:JSON.stringify({
            action:"transaction",
            payload:{
            sheet,
            name:String(name).trim(),
            tType:type,
            tag,
            amount:Number(amount),
            date,
            description:String(description || "").trim()
            }
            })
            })

            const data = await res.json()

            if(data.status==="success"){
            setToast("Transaction Added : "+data.entryId)
            setTimeout(()=>setToast(""),2000)
            resetCommon()
            amountRef.current?.focus()
            }
            else{
            alert(data.message || "Transaction failed")
            }

            setSaving(false)

    }

    /* ================= CONTRA ================= */

    async function submitContra(){

                if(saving) return
            setSaving(true)

            if(!name || !fromTag || !toTag || !date || !amount){
            alert("Please fill all required fields")
            return
            }

            if(fromTag===toTag){
            alert("From Tag and To Tag cannot be same")
            return
            }

            const res = await fetch(API,{
            method:"POST",
            headers:{ "Content-Type":"application/json"},
            body:JSON.stringify({
            action:"contra",
            payload:{
            fromTag,
            toTag,
            name:String(name).trim(),
            amount:Number(amount),
            date,
            description:String(description || "").trim()
            }
            })
            })

            const data = await res.json()

            if(data.status==="success"){
            setToast("Contra Added : "+data.entryId)
            setTimeout(()=>setToast(""),2000)
            resetCommon()
            setFromTag("")
            setToTag("")
            amountRef.current?.focus()
            }
            else{
            alert(data.message || "Contra failed")
            }

            setSaving(false)

    }

    /* ================= ADJUSTMENT ================= */

    async function submitAdjustment(){

                if(saving) return
            setSaving(true)

            if(!mainSheet || !mainType || !mainName || !ncSheet || !ncType || !ncName || !amount || !date){
            alert("Please fill all required fields")
            return
            }

            const res = await fetch(API,{
            method:"POST",
            headers:{ "Content-Type":"application/json"},
            body:JSON.stringify({
            action:"adjustment",
            payload:{
            mainSheet,
            mainType,
            mainName:String(mainName).trim(),
            ncSheet,
            ncType,
            ncName:String(ncName).trim(),
            amount:Number(amount),
            date,
            description:String(description || "").trim()
            }
            })
            })

            const data = await res.json()

            if(data.status==="success"){
            setToast("Adjustment Added : "+data.entryId)
            setTimeout(()=>setToast(""),2000)
            resetCommon()
            amountRef.current?.focus()
            }
            else{
            alert(data.message || "Adjustment failed")
            }

            setSaving(false)

    }



    return(

        <div className="finance-page">
        <div className="finance-card">
        <div className="finance-header">
            
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
            window.location.href="/mf-2"
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

            <div className="finance-nav">

                <button
                className="active"
                onClick={()=>window.location.href="/mf-2/dashboard"}
                >
                Add
                </button>

                <button
                onClick={()=>window.location.href="/mf-2/ledger"}
                >
                Ledger
                </button>

                <button
                onClick={()=>window.location.href="/mf-2/masters"}
                >
                Masters
                </button>

            </div>  

        </div>

        <div style={{
        position:"sticky",
        top:10,
        background:"#fff",
        padding:"10px 0",
        display:"flex",
        gap:2,
        marginBottom:10,
        zIndex:30
        }}>
        
        <button
        style={{
        flex:1,
        padding:"10px",
        borderRadius:8,
        border:"1px solid #ccc",
        background:engine==="transaction"?"#111":"#fff",
        color:engine==="transaction"?"#fff":"#000"
        }}
        onClick={()=>setEngine("transaction")}
        >
        Transaction
        </button>

        <button
        style={{
        flex:1,
        padding:"10px",
        borderRadius:8,
        border:"1px solid #ccc",
        background:engine==="contra"?"#111":"#fff",
        color:engine==="contra"?"#fff":"#000"
        }}
        onClick={()=>setEngine("contra")}
        >
        Contra
        </button>

        <button
        style={{
        flex:1,
        padding:"10px",
        borderRadius:8,
        border:"1px solid #ccc",
        background:engine==="adjustment"?"#111":"#fff",
        color:engine==="adjustment"?"#fff":"#000"
        }}
        onClick={()=>setEngine("adjustment")}
        >
        Adjustment
        </button>


        </div>

    {/* ================= TRANSACTION ================= */}

        {engine==="transaction" && (

            <div style={{display:"flex",flexDirection:"column",gap:12}}>

            <select
                value={sheet}
                onChange={e=>{
                setSheet(e.target.value)
                setName("")
                setHead("")
                setType("")
                setTag("")
                setAmount("")
                setDescription("")
                }}
                style={{
                padding:"10px",
                borderRadius:8,
                border:"1px solid #ccc",
                fontSize:15,
                background:"#fff"
                }}
            >
            
            <option value="">Select Sheet</option>

            {sheets.map(s=>
            <option key={s} value={s}>{s}</option>
            )}

            </select>

            {sheet==="PERSONAL-T" && (

                <select
                    value={head}
                    onChange={e=>{
                    setHead(e.target.value)
                    setName("")
                    }}
                    style={{
                    padding:"10px",
                    borderRadius:8,
                    border:"1px solid #ccc",
                    fontSize:15,
                    background:"#fff"
                    }}
                >

            <option value="">Select Head</option>

            {Object.keys(names || {}).map(h=>
            <option key={h} value={h}>{h}</option>
            )}

            </select>

            )}

            {sheet && (

            <select 
              value={name} 
              onChange={e=>setName(e.target.value)}
               style={{
                    padding:"10px",
                    borderRadius:8,
                    border:"1px solid #ccc",
                    fontSize:15,
                    background:"#fff"
                    }}
            >

            <option value="">Select Name</option>

            {sheet==="PERSONAL-T"
            ? (names?.[head] || []).map((n:any)=>
            <option key={n} value={n}>{n}</option>
            )
            : (names || []).map((n:any)=>
            <option key={n} value={n}>{n}</option>
            )
            }

            </select>

            )}

            <select 
                value={type} 
                onChange={e=>setType(e.target.value)}
                style={{
                    padding:"10px",
                    borderRadius:8,
                    border:"1px solid #ccc",
                    fontSize:15,
                    background:"#fff"
                    }}    
                
            >

            <option value="">Select Type</option>

            {types.map((t:any)=>
            <option key={t.type} value={t.type}>{t.type}</option>
            )}

            </select>

            {!isWriteoff && !isTransferred && !isNotional && (

            <select 
                value={tag}    
                onChange={e=>setTag(e.target.value)}
                style={{
                    padding:"10px",
                    borderRadius:8,
                    border:"1px solid #ccc",
                    fontSize:15,
                    background:"#fff"
                    }}    
            >

            <option value="">Select Tag</option>

            {tags.map((t:any)=>
            <option key={t} value={t}>{t}</option>
            )}

            </select>

            )}

            <input
            ref={amountRef}
            type="number"
            placeholder="Amount"
            value={amount}
            onChange={e=>setAmount(e.target.value)}
            style={{
                    padding:"10px",
                    borderRadius:8,
                    border:"1px solid #ccc",
                    fontSize:15,
                    background:"#fff"
                    }}
            />

            {dateInput(date,setDate)}

            <input
            placeholder="Description"
            value={description}
            onChange={e=>setDescription(e.target.value)}
            style={{
                    padding:"10px",
                    borderRadius:8,
                    border:"1px solid #ccc",
                    fontSize:15,
                    background:"#fff"
                    }}
            />

            <button
            disabled={saving}
            onClick={submitTransaction}
            style={{
            padding:"12px",
            borderRadius:8,
            border:"1px solid #ccc",
            background:"#111",
            color:"#fff",
            fontSize:15
            }}
            >
            {saving ? "Saving..." : "Submit"}
            </button>

            </div>

        )}

    {/* ================= CONTRA ================= */}

        {engine==="contra" && (

            <div style={{display:"flex",flexDirection:"column",gap:12}}>

            <select 
                value={name} 
                onChange={e=>setName(e.target.value)}
                style={{
                    padding:"10px",
                    borderRadius:8,
                    border:"1px solid #ccc",
                    fontSize:15,
                    background:"#fff"
                    }}
                    >

            <option value="">Select Name</option>

            {masters.names["OTHER-T"].map((n:any)=>
            <option key={n} value={n}>{n}</option>
            )}

            </select>

            <select 
                value={fromTag}     
                onChange={e=>setFromTag(e.target.value)}
            style={{
                    padding:"10px",
                    borderRadius:8,
                    border:"1px solid #ccc",
                    fontSize:15,
                    background:"#fff"
                    }}    
            >


            <option value="">From</option>

            {tags.map((t:any)=>
            <option key={t} value={t}>{t}</option>
            )}

            </select>

            <select value={toTag} onChange={e=>setToTag(e.target.value)}
            style={{
                    padding:"10px",
                    borderRadius:8,
                    border:"1px solid #ccc",
                    fontSize:15,
                    background:"#fff"
                    }}>


            <option value="">To</option>

            {tags.map((t:any)=>
            <option key={t} value={t}>{t}</option>
            )}

            </select>

            <input
            type="number"
            placeholder="Amount"
            value={amount}
            onChange={e=>setAmount(e.target.value)}
            style={{
                    padding:"10px",
                    borderRadius:8,
                    border:"1px solid #ccc",
                    fontSize:15,
                    background:"#fff"
                    }}
            />

            {dateInput(date,setDate)}

            <input
            placeholder="Description"
            value={description}
            onChange={e=>setDescription(e.target.value)}
            style={{
                    padding:"10px",
                    borderRadius:8,
                    border:"1px solid #ccc",
                    fontSize:15,
                    background:"#fff"
                    }}
            />

            <button
            disabled={saving}
            onClick={submitContra}
            style={{
            padding:"12px",
            borderRadius:8,
            border:"1px solid #ccc",
            background:"#111",
            color:"#fff",
            fontSize:15
            }}
            >
            {saving ? "Saving..." : "Submit"}
            </button>

            </div>

        )}

    {/* ================= ADJUSTMENT ================= */}

        {engine==="adjustment" && (

            <div style={{display:"flex",flexDirection:"column",gap:12}}>

            <select value={mainSheet} onChange={e=>{
            setMainSheet(e.target.value)
            setMainType("")
            setMainName("")
            }}
            style={{
                    padding:"10px",
                    borderRadius:8,
                    border:"1px solid #ccc",
                    fontSize:15,
                    background:"#fff"
                    }}    
            >

            <option value="">Main Sheet</option>

            {sheets.map(s=>
            <option key={s} value={s}>{s}</option>
            )}

            </select>

            <select 
                value={mainType} 
                onChange={e=>setMainType(e.target.value)}
                style={{
                    padding:"10px",
                    borderRadius:8,
                    border:"1px solid #ccc",
                    fontSize:15,
                    background:"#fff"
                    }}
            >

            <option value="">Main Type</option>

            {(masters.types[mainSheet] || [])
            .filter((t:any)=>String(t.mode).toUpperCase()==="NON-CASH")
            .map((t:any)=>
            <option key={t.type} value={t.type}>{t.type}</option>
            )}

            </select>

            <select 
                value={mainName} 
                onChange={e=>setMainName(e.target.value)}
                style={{
                    padding:"10px",
                    borderRadius:8,
                    border:"1px solid #ccc",
                    fontSize:15,
                    background:"#fff"
                    }}
            >

            <option value="">Main Name</option>

            {Object.values(masters.names[mainSheet] || {})
            .flat()
            .map((n:any)=>
            <option key={n} value={n}>{n}</option>
            )}

            </select>

            <select value={ncSheet} onChange={e=>{
            setNcSheet(e.target.value)
            setNcType("")
            setNcName("")
            }}
            style={{
                    padding:"10px",
                    borderRadius:8,
                    border:"1px solid #ccc",
                    fontSize:15,
                    background:"#fff"
                    }}
            >

            <option value="">NC Sheet</option>

            {sheets.map(s=>
            <option key={s} value={s}>{s}</option>
            )}

            </select>

            <select value={ncType} onChange={e=>setNcType(e.target.value)}
                style={{
                    padding:"10px",
                    borderRadius:8,
                    border:"1px solid #ccc",
                    fontSize:15,
                    background:"#fff"
                    }}>

            <option value="">NC Type</option>

            {(masters.types[ncSheet] || [])
            .filter((t:any)=>String(t.mode).toUpperCase()==="NON-CASH")
            .map((t:any)=>
            <option key={t.type} value={t.type}>{t.type}</option>
            )}

            </select>

            <select value={ncName} onChange={e=>setNcName(e.target.value)}
                style={{
                    padding:"10px",
                    borderRadius:8,
                    border:"1px solid #ccc",
                    fontSize:15,
                    background:"#fff"
                    }}>

            <option value="">NC Name</option>

            {Object.values(masters.names[ncSheet] || {})
            .flat()
            .map((n:any)=>
            <option key={n} value={n}>{n}</option>
            )}

            </select>

            <input
            type="number"
            placeholder="Amount"
            value={amount}
            onChange={e=>setAmount(e.target.value)}
            style={{
                    padding:"10px",
                    borderRadius:8,
                    border:"1px solid #ccc",
                    fontSize:15,
                    background:"#fff"
                    }}
            />

            {dateInput(date,setDate)}

            <input
            placeholder="Description"
            value={description}
            onChange={e=>setDescription(e.target.value)}
            style={{
                    padding:"10px",
                    borderRadius:8,
                    border:"1px solid #ccc",
                    fontSize:15,
                    background:"#fff"
                    }}
            />

            <button
            disabled={saving}
            onClick={submitAdjustment}
            style={{
            padding:"12px",
            borderRadius:8,
            border:"1px solid #ccc",
            background:"#111",
            color:"#fff",
            fontSize:15
            }}
            >
            {saving ? "Saving..." : "Submit"}
            </button>

            </div>

            )}

           {saving && (

                <div style={{
                position:"fixed",
                top:0,
                left:0,
                width:"100%",
                height:"100%",
                background:"rgba(0,0,0,0.4)",
                display:"flex",
                alignItems:"center",
                justifyContent:"center",
                zIndex:999
                }}>

                <div style={{
                background:"#fff",
                padding:"20px 30px",
                borderRadius:10,
                fontSize:16,
                fontWeight:600,
                boxShadow:"0 6px 18px rgba(0,0,0,0.2)"
                }}>

                Saving entry...

                </div>

                </div>

                )}
           
           {toast && (

                <div style={{
                position:"fixed",
                bottom:30,
                left:"50%",
                transform:"translateX(-50%)",
                background:"#111",
                color:"#fff",
                padding:"12px 18px",
                borderRadius:8,
                boxShadow:"0 6px 18px rgba(0,0,0,0.2)",
                fontSize:14,
                zIndex:1000
                }}>

                {toast}

                </div>

                )}

            </div>
            
            </div>

    )

}