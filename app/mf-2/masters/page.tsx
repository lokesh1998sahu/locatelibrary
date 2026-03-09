"use client"

import { useEffect, useState } from "react"

const API="/api/ledger"

export default function Masters(){

    const [sheets,setSheets]=useState<any[]>([])
    const [sheet,setSheet]=useState("")
    const [data,setData]=useState<any>(null)

    const [head,setHead]=useState("")
    const [name,setName]=useState("")
    const [newHead,setNewHead]=useState("")

    const [loading,setLoading]=useState(false)
    const [toast,setToast]=useState("")

    const [adding,setAdding] = useState(false)


     useEffect(()=>{
        const auth = localStorage.getItem("financeAuthorized")
    
        if(auth!=="true"){
        window.location.href="/mf-2"
        }
        },[])

    /* LOAD SHEETS */

    useEffect(()=>{

        fetch(API,{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({action:"getSheets"})
        })
        .then(r=>r.json())
        .then(d=>{
        if(d.status==="success"){
        setSheets(d.sheets)
        }
        })

    },[])

    /* LOAD NAMES */

    useEffect(()=>{

        if(!sheet) return
        setLoading(true)
    
        fetch(API,{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({
        action:"getNames",
        payload:{sheet}
        })
        })
        .then(r=>r.json())
        .then(d=>{
        setData(d)
        setHead("")
        setLoading(false)
        })

    },[sheet])

    /* ADD NAME */

    async function addName(){
        
        if(adding) return
        setAdding(true)

        if(!name){
        alert("Enter Name")
        setAdding(false)
        return
        }

        if(data?.type==="HEAD" && !head){
        alert("Please enter Head-Name")
        setAdding(false)
        return
        }

        const payload:any={
        sheet,
        name
        }

        if(data?.type==="HEAD"){
        payload.head=head
        }

        const res=await fetch(API,{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({
        action:"addName",
        payload
        })
        })

        const result=await res.json()

        if(result.status!=="success"){
        alert(result.message || "Error")
        setAdding(false)
        return
        }

        setName("")
        setHead("")
        setToast("Name added successfully")
        setTimeout(()=>setToast(""),2000)

        reload()

        setAdding(false)

    }


    /* RELOAD */

    function reload(){

        fetch(API,{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({
        action:"getNames",
        payload:{sheet}
        })
        })
        .then(r=>r.json())
        .then(setData)

    }

    /* PERSONAL-T LIST */

    function renderHeadNames(){

        if(!head) return <div>Select head to view names</div>

        const list=data.data[head] || []

        return(

        <div style={{
        display:"flex",
        flexDirection:"column",
        gap:6
        }}>

        {list.map((n:any)=>(
        <div key={n} style={styles.item}>
        {n}
        </div>
        ))}

        </div>

        )

    }

    /* UI */

    return(

        <div className="finance-page">
        <div className="finance-card" style={styles.page}>
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
          onClick={()=>window.location.href="/mf-2/add"}
          >
          Add
          </button>

          <button
            onClick={()=>window.location.href="/mf-2/ledger"}
          >
          Ledger
          </button>

          <button
          className="active"
          onClick={()=>window.location.href="/mf-2/dashboard"}
          >
          Masters
          </button>

          </div>

        </div>


        {/* SELECT SHEET */}

        <select
        value={sheet}
        onChange={e=>{
        setSheet(e.target.value)
        setHead("")
        }}
        style={styles.select}
        >

        <option value="">Select Sheet</option>

        {sheets.map(s=>
        <option key={s.name} value={s.name}>
        {s.name}
        </option>
        )}

        </select>


        {/* FLAT SHEETS */}

        {data && data.type==="FLAT" && (

        <div style={styles.card}>

        <h3>Names</h3>

        <div style={styles.list}>

        {data.data.map((n:any)=>(
        <div key={n} style={styles.item}>{n}</div>
        ))}

        </div>

        <div style={styles.addRow}>

        <input
        placeholder="New Name"
        value={name}
        onChange={e=>setName(e.target.value)}
        style={styles.input}
        />

        <button onClick={addName} style={styles.button}>
        Add
        </button>

        </div>

        </div>

        )}


        {/* PERSONAL-T */}

        {data && data.type==="HEAD" && (

        <div style={{display:"flex",flexDirection:"column",gap:20}}>

        {/* HEAD SELECT */}

        <select
        value={head}
        onChange={e=>{
        setHead(e.target.value)
        setNewHead("")
        }}
        style={styles.select}
        >

        <option value="">Select Head</option>

        {Object.keys(data.data).map(h=>(
        <option key={h} value={h}>{h}</option>
        ))}

        </select>


        {/* NAME LIST */}

        <div style={styles.list}>

        {renderHeadNames()}

        </div>


        {/* ADD NAME / ADD HEAD */}

        <div style={styles.card}>

        <h3 style={{
        fontSize:16,
        fontWeight:700,
        marginBottom:8,
        color:"#111827"
        }}>
        Add Name
        </h3>

        <input
        placeholder="Head-Name (New or Existing)"
        value={head}
        onChange={e=>setHead(e.target.value)}
        style={styles.input}
        />

        <input
        placeholder="Name"
        value={name}
        onChange={e=>setName(e.target.value)}
        style={styles.input}
        />

        <button onClick={addName} style={styles.button}>
        Add
        </button>

        </div>

        </div>

        )}


        {adding && (

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
            borderRadius:12,
            display:"flex",
            flexDirection:"column",
            alignItems:"center",
            gap:12
            }}>

            <div style={{
            width:24,
            height:24,
            border:"4px solid #111",
            borderTop:"4px solid transparent",
            borderRadius:"50%",
            animation:"spin 1s linear infinite"
            }}/>

            <div style={{fontWeight:600}}>
            Adding...
            </div>

            </div>

            </div>

        )}

        {loading && (

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
        fontSize:14
        }}>

        {toast}

        </div>

        )}

        </div>
        </div>

    )

}

const styles:any={

        page:{
        display:"flex",
        flexDirection:"column",
        gap:18
        },

        select:{
        padding:10,
        borderRadius:8,
        border:"1px solid #ccc"
        },

        card:{
        background:"#fff",
        padding:18,
        borderRadius:10,
        display:"flex",
        flexDirection:"column",
        gap:10,
        boxShadow:"0 4px 14px rgba(0,0,0,0.08)"
        },

        list:{
        border:"1px solid #ddd",
        borderRadius:8,
        padding:10,
        maxHeight:280,
        overflowY:"auto",
        background:"#fafafa"
        },

        item:{
        padding:"6px 10px",
        borderBottom:"1px solid #eee"
        },

        addRow:{
        display:"flex",
        gap:10
        },

        input:{
        padding:10,
        borderRadius:8,
        border:"1px solid #ccc"
        },

        button:{
        padding:"12px",
        width:"100%",
        borderRadius:8,
        border:"none",
        background:"#111",
        color:"#fff",
        fontWeight:600,
        cursor:"pointer"
        }

}