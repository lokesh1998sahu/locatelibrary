"use client";

import { useEffect, useState, useRef } from "react";

type SheetItem = {
  name: string;
  category: string;
};

export default function LedgerPage() {

    const [editEntry,setEditEntry] = useState<any[] | null>(null)
    const [newDescription,setNewDescription] = useState("")
    const [savingEdit,setSavingEdit] = useState(false)

    const [sheets, setSheets] = useState<SheetItem[]>([]);
    const [sheet, setSheet] = useState<string>("");

    const [category,setCategory] = useState("")
    const [filteredSheets,setFilteredSheets] = useState<SheetItem[]>([])

    const [entries, setEntries] = useState<any[][]>([]);
    const [headers, setHeaders] = useState<string[]>([]);

    const [loading, setLoading] = useState<boolean>(true);
    const [selectedEntry, setSelectedEntry] = useState<any[] | null>(null);

    const [reversingId,setReversingId] = useState<string | null>(null)

    const [searchName,setSearchName] = useState("")
    const [searchDesc,setSearchDesc] = useState("")
    const [fromDate,setFromDate] = useState("")
    const [toDate,setToDate] = useState("")

    const [quickRange,setQuickRange] = useState("")

    const [duplicating,setDuplicating] = useState(false)

    const searchRef = useRef<HTMLInputElement>(null)

    const [toast,setToast] = useState("")

    const API = "/api/ledger";

    const reverseSheets = [
    "LIBRARY-T",
    "PERSONAL-T",
    "OTHER-T",
    "IPO & TRADING",
    "INVESTMENTS",
    "RECEIVABLES",
    "ASSETS",
    "PORTFOLIO"
    ]

        useEffect(()=>{
    const auth = localStorage.getItem("financeAuthorized")

    if(auth!=="true"){
    window.location.href="/finance"
    }
    },[])

    
    useEffect(()=>{
      searchRef.current?.focus()
    },[])

    function getValue(row: any[], column: string) {
      const idx = headers.indexOf(column);
      return idx === -1 ? "" : row[idx];
    }


    function formatDateTime(value:any){

        if(!value) return ""

        const d = new Date(value)

        return d.toLocaleString("en-IN",{
        day:"2-digit",
        month:"short",
        year:"numeric",
        hour:"2-digit",
        minute:"2-digit"
        })

    }


  function detectAmount(row: any[]) {

        const idxNonCash = headers.indexOf("NON-CASH-AMOUNT")
        const idxTransfer = headers.indexOf("TRANSFER AMOUNT")

        /* Adjustment entries */

        if(idxNonCash >= 0){

        const val = row[idxNonCash]

        if(typeof val === "number" && val !== 0){
        return { amount: val, tag: "NON-CASH" }
        }

        }

        /* Reserves transfer */

        if(idxTransfer >= 0){

        const val = row[idxTransfer]

        if(typeof val === "number" && val !== 0){
        return { amount: val, tag: "TRANSFER" }
        }

        }

        /* Normal tag columns */

        let start = idxNonCash + 1

        if(idxTransfer !== -1){
        start = idxTransfer + 1
        }

        for(let i=start;i<row.length;i++){

        const v=row[i]

        if(typeof v==="number" && v!==0){

        return{
        amount:v,
        tag:headers[i]
        }

        }

        }

        return{
        amount:null,
        tag:""
        }

  }


    async function loadSheets() {

      const res = await fetch(API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "getSheets" })
      });

      const data = await res.json();

      if (data.status === "success") {
        setSheets(data.sheets);
      }

    }


    function applyQuickRange(range:string){

        setQuickRange(range)

        const today = new Date()

        if(range==="today"){

          const d = today.toISOString().split("T")[0]

          setFromDate(d)
          setToDate(d)

        }

        else if(range==="week"){

          const start = new Date()
          start.setDate(today.getDate()-6)

          setFromDate(start.toISOString().split("T")[0])
          setToDate(today.toISOString().split("T")[0])

        }

        else if(range==="month"){

          const start = new Date(today.getFullYear(),today.getMonth(),1)

          setFromDate(start.toISOString().split("T")[0])
          setToDate(today.toISOString().split("T")[0])

        }

        else if(range==="all"){

          setFromDate("")
          setToDate("")

        }

      }


    async function loadLedger() {

      if (!sheet) {
        setEntries([])
        setLoading(false)
        return
      }

      setLoading(true);

      const res = await fetch(API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "ledger",
          payload: {
            sheet,
            limit: 20,
            name: searchName || null,
            description: searchDesc || null,
            fromDate: fromDate || null,
            toDate: toDate || null
          }
        })
      });

      const data = await res.json();

      if (data.status === "success") {
        setHeaders(data.headers || []);
        setEntries(data.rows || []);
      }

      setLoading(false);

    }

    async function reverseEntry(entryId: string, cashType: string) {

      if(reversingId) return
      
      if (cashType === "NON-CASH") {
        alert("Adjustment entries cannot be reversed.");
        return;
      }

      const confirmAction = confirm("Reverse this entry?");
      if (!confirmAction) return;

      setReversingId(entryId)

      const res = await fetch(API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "reversal",
          payload: { sheet, entryId }
        })
      });

      const data = await res.json();

      if (data.status === "success") {

        setToast("Entry reversed successfully")
        setTimeout(()=>setToast(""),2000)

        setReversingId(null)

        loadLedger()

        }

    }

    useEffect(() => { loadSheets(); }, []);

    useEffect(() => { 
      loadLedger(); 
    }, [sheet]);

    useEffect(()=>{

      if(!category){
        setFilteredSheets([])
        return
      }

      const list = sheets.filter(s=>s.category===category)
      setFilteredSheets(list)

    },[category,sheets])

    const categories = [...new Set(sheets.map(s=>s.category))]


      function duplicateEntry(row:any[]){

        setDuplicating(true)

        const entry = {
        sheet,
        name:getValue(row,"NAME"),
        head:getValue(row,"HEAD-NAME"),
        type:getValue(row,"T-TYPE"),
        description:getValue(row,"DESCRIPTION")
        }

        const {amount,tag} = detectAmount(row)

        const payload = {
        ...entry,
        tag,
        amount
        }

        localStorage.setItem("duplicateEntry",JSON.stringify(payload))

        window.location.href="/finance/add"
        
      }

      async function saveEdit(){

          if(!editEntry) return

          const entryId = getValue(editEntry,"ENTRY-ID")

          setSavingEdit(true)

          const res = await fetch(API,{
          method:"POST",
          headers:{ "Content-Type":"application/json"},
          body:JSON.stringify({
          action:"edit_description",
          payload:{
          sheet,
          entryId,
          description:newDescription
          }
          })
          })

          const data = await res.json()

          if(data.status==="success"){

          setEditEntry(null)
          setNewDescription("")
          loadLedger()

          }else{
          alert("Update failed")
          }

          setSavingEdit(false)

          }


    return (

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

          <div className="finance-nav">
          <button
          onClick={()=>window.location.href="/finance/add"}
          >
          Add
          </button>

          <button
          className="active"
          onClick={()=>window.location.href="/finance/dashboard"}
          >
          Ledger
          </button>

          <button
          onClick={()=>window.location.href="/finance/masters"}
          >
          Masters
          </button>

          </div>
          </div>

        <div style={{
          display:"flex",
          gap:8,
          marginBottom:15
          }}>

          <button
          onClick={()=>applyQuickRange("today")}
          style={{
          flex:1,
          padding:"8px",
          borderRadius:8,
          border:"1px solid #ccc",
          background:quickRange==="today"?"#111":"#fff",
          color:quickRange==="today"?"#fff":"#000"
          }}
          >
          Today
          </button>

          <button
          onClick={()=>applyQuickRange("week")}
          style={{
          flex:1,
          padding:"8px",
          borderRadius:8,
          border:"1px solid #ccc",
          background:quickRange==="week"?"#111":"#fff",
          color:quickRange==="week"?"#fff":"#000"
          }}
          >
          Week
          </button>

          <button
          onClick={()=>applyQuickRange("month")}
          style={{
          flex:1,
          padding:"8px",
          borderRadius:8,
          border:"1px solid #ccc",
          background:quickRange==="month"?"#111":"#fff",
          color:quickRange==="month"?"#fff":"#000"
          }}
          >
          Month
          </button>

          <button
          onClick={()=>applyQuickRange("all")}
          style={{
          flex:1,
          padding:"8px",
          borderRadius:8,
          border:"1px solid #ccc",
          background:quickRange==="all"?"#111":"#fff",
          color:quickRange==="all"?"#fff":"#000"
          }}
          >
          All
          </button>

          </div>


        {/* CATEGORY + SHEET FILTER */}

        <div style={{display:"flex",flexDirection:"column",gap:10,marginBottom:20}}>

          <select
          value={category}
          onChange={e=>{
            setCategory(e.target.value)
            setSheet("")
            setEntries([])
          }}
          style={{
            padding:8,
            borderRadius:6,
            border:"1px solid #ccc"
          }}
          >
            <option value="">Select Category</option>

            {categories.map(c=>
              <option key={c} value={c}>{c}</option>
            )}

          </select>

          <select
          value={sheet}
          onChange={e=>setSheet(e.target.value)}
          style={{
            padding:8,
            borderRadius:6,
            border:"1px solid #ccc"
          }}
          >

            <option value="">Select Sheet</option>

            {filteredSheets.map(s=>
              <option key={s.name} value={s.name}>{s.name}</option>
            )}

          </select>

        </div>


        {/* FILTERS */}

        <div style={{
          display:"flex",
          flexDirection:"column",
          gap:10,
          marginBottom:20
        }}>

          <input
            ref={searchRef}
            placeholder="Search by Name"
            value={searchName}
            onChange={e=>setSearchName(e.target.value)}
            style={{
              padding:8,
              borderRadius:6,
              border:"1px solid #ccc"
            }}
          />

          <input
            placeholder="Search Description"
            value={searchDesc}
            onChange={e=>setSearchDesc(e.target.value)}
            style={{
              padding:8,
              borderRadius:6,
              border:"1px solid #ccc"
            }}
          />

          <div style={{display:"flex",gap:10}}>

            <input
              type="date"
              value={fromDate}
              onChange={e=>{
                setQuickRange("")
                setFromDate(e.target.value)
              }}
              style={{
                padding:8,
                borderRadius:6,
                border:"1px solid #ccc",
                flex:1
              }}
            />

            <input
              type="date"
              value={toDate}
              onChange={e=>{
                 setQuickRange("")
                setToDate(e.target.value)
              }}
              style={{
                padding:8,
                borderRadius:6,
                border:"1px solid #ccc",
                flex:1
              }}
            />

          </div>

          <div style={{display:"flex", gap:8}}>
              <button
                onClick={()=> loadLedger()}
                style={{
                  flex:1,
                  padding:"8px",
                  borderRadius:6,
                  border:"1px solid #ccc",
                  background:"#111",
                  color:"#fff",
                  cursor:"pointer"
                }}
              >
                Search
              </button>
              <button
                onClick={()=>{
                  setSearchName("")
                  setSearchDesc("")
                  setFromDate("")
                  setToDate("")
                  loadLedger()
                }}
                style={{
                  flex:1,
                  padding:"8px",
                  borderRadius:6,
                  border:"1px solid #ccc",
                  background:"#111",
                  color:"#fff",
                  cursor:"pointer"
                }}
              >
                Clear
              </button>
            </div>

        </div>

        {/* EMPTY LEDGER MESSAGE */}

        {!loading && entries.length === 0 && (

          

          <div style={{
          padding:20,
          textAlign:"center",
          color:"#777",
          border:"1px dashed #ccc",
          borderRadius:10,
          marginBottom:20
          }}>

          Select a sheet to view entries.

          </div>

          )}

        {/* ENTRIES */}

        {entries.map((row, i) => {

          const name = getValue(row, "NAME");
          const type = getValue(row, "T-TYPE");
          const date = getValue(row, "DATE");
          const entryId = getValue(row, "ENTRY-ID");
          const cashType = getValue(row, "CASH/NON-CASH");
          const description = getValue(row, "DESCRIPTION");
          const isReversal = getValue(row,"ENTRY-TYPE")==="REVERSAL"

          const { amount, tag } = detectAmount(row);

               let displayAmount = amount

                if(
                displayAmount !== null &&
                reverseSheets.includes(sheet)
                ){
                displayAmount = displayAmount * -1
                }

          const btn:any = {

            padding:"6px 10px",
            borderRadius:8,
            border:"1px solid #ddd",
            background:"#fff",
            cursor:"pointer",
            fontSize:12

            }

          return (

            <div
              key={i}
              style={{
              border:"1px solid #e5e7eb",
              borderRadius:14,
              padding:16,
              marginBottom:14,
              background:isReversal ? "#fff5f5":"#ffffff",
              boxShadow:"0 6px 18px rgba(0,0,0,0.08)"
              }}
              >

              {/* NAME + REVERSAL ICON */}

              <div style={{
              display:"flex",
              justifyContent:"space-between",
              alignItems:"center",
              marginBottom:6
              }}>

              <div style={{
              fontWeight:700,
              fontSize:16
              }}>
              {name}
              </div>

              {isReversal && (
              <div style={{
              fontSize:12,
              background:"#ffeaea",
              color:"#b00020",
              padding:"3px 8px",
              borderRadius:8,
              fontWeight:600
              }}>
              ↺ REVERSAL
              </div>
              )}

              </div>


              {/* TYPE */}

              <div style={{
              fontSize:13,
              color:"#555",
              marginBottom:4
              }}>
              {type}
              </div>


              {/* DESCRIPTION */}

              {description && (

              <div style={{
              fontSize:13,
              color:"#666",
              marginBottom:6,
              whiteSpace:"nowrap",
              overflow:"hidden",
              textOverflow:"ellipsis"
              }}>

              {description}

              </div>

              )}


              {/* AMOUNT */}

              {displayAmount !== null && (

              <div style={{
              fontSize:16,
              fontWeight:700,
              color: displayAmount > 0 ? "#16a34a" : "#dc2626"
              }}>

              {displayAmount > 0 ? "+" : ""}₹{displayAmount} {tag}

              </div>

              )}


              {/* FOOTER */}

              <div style={{
              marginTop:6,
              display:"flex",
              justifyContent:"space-between",
              fontSize:11,
              color:"#777"
              }}>

              <div
              style={{cursor:"pointer"}}
              title="Click to copy ID"
              onClick={()=>navigator.clipboard.writeText(entryId)}
              >
              {entryId}
              </div>

              <div>
              {formatDateTime(getValue(row,"TIMESTAMP"))}
              </div>

              </div>

              {/* ACTIONS */}

              <div style={{
              marginTop:10,
              display:"flex",
              gap:8
              }}>

              <button
              onClick={()=>setSelectedEntry(row)}
              style={btn}
              >
              View
              </button>

              {getValue(row,"ENTRY-TYPE")==="TRANSACTION" && (
              <button onClick={()=>duplicateEntry(row)} style={btn}>
              Duplicate
              </button>
              )}

              <button
              onClick={()=>{
              setEditEntry(row)
              setNewDescription(getValue(row,"DESCRIPTION"))
              }}
              style={btn}
              >
              Edit
              </button>

              {getValue(row,"ENTRY-TYPE")!=="REVERSAL" && (

              <button
              disabled={cashType==="NON-CASH" || reversingId===entryId}
              onClick={()=>reverseEntry(entryId,cashType)}
              style={btn}
              >

              {reversingId===entryId ? "Reversing..." : "Reverse"}

              </button>

              )}

              </div>

              </div>

          );

        })}

      {selectedEntry && (

          <div style={{
          position:"fixed",
          top:0,
          left:0,
          width:"100%",
          height:"100%",
          background:"rgba(0,0,0,0.6)",
          display:"flex",
          alignItems:"center",
          justifyContent:"center",
          zIndex:1000
          }}>

          <div style={{
          background:"#fff",
          padding:20,
          borderRadius:10,
          width:420,
          boxShadow:"0 10px 30px rgba(0,0,0,0.2)",
          maxHeight:"80vh",
          overflow:"auto"
          }}>

            <h3 style={{
            marginBottom:16,
            fontSize:18,
            fontWeight:700
            }}>
            Entry Details
            </h3>

            {getValue(selectedEntry,"REVERSAL-OF") && (

              <div style={{
              marginBottom:10,
              padding:8,
              background:"#fff5f5",
              borderRadius:6,
              fontSize:13,
              color:"#b00020",
              fontWeight:600
              }}>
              ↺ Reversal of : {getValue(selectedEntry,"REVERSAL-OF")}
              </div>

              )}


            <div style={{
            display:"flex",
            flexDirection:"column",
            gap:8
            }}>

            {headers.map((h,i)=>{

            const value = selectedEntry[i]
            const isReversal = getValue(selectedEntry,"ENTRY-TYPE")==="REVERSAL"

            if(value=== "" || value=== null) return null

            let displayValue = value

           const amountColumns = [
            "NON-CASH-AMOUNT",
            "TRANSFER AMOUNT",
            ...headers.slice(headers.indexOf("NON-CASH-AMOUNT")+1)
            ]

            if(
            typeof value === "number" &&
            amountColumns.includes(h) &&
            reverseSheets.includes(sheet)
            ){
            displayValue = value * -1
            }

            let color="#333"

           if(
            typeof displayValue==="number" &&
            amountColumns.includes(h)
            ){
            color = displayValue > 0 ? "#16a34a" : "#dc2626"
            }

            return(

            <div
            key={h}
            style={{
            display:"flex",
            justifyContent:"space-between",
            padding:"6px 0",
            borderBottom:"1px solid #f0f0f0",
            fontSize:14
            }}
            >

            <div style={{
            fontWeight:600,
            color:"#555"
            }}>
            {h}
            </div>

            <div style={{
            color:color,
            fontWeight: typeof displayValue==="number" ? 700 : 500
            }}>

            {h==="TIMESTAMP"
              ? formatDateTime(displayValue)
              : h==="DATE"
              ? new Date(displayValue).toLocaleDateString("en-IN")
              : String(displayValue)}

            </div>

            </div>

            )

            })}

            </div>


            {getValue(selectedEntry,"ENTRY-TYPE")==="REVERSAL" && (

            <div style={{
            marginTop:12,
            padding:10,
            borderRadius:8,
            background:"#ffeaea",
            color:"#b00020",
            fontWeight:600,
            textAlign:"center"
            }}>
            ↺ This entry is a REVERSAL
            </div>

            )}

          <div style={{marginTop:15}}>

          <button
          onClick={()=>setSelectedEntry(null)}
          style={{
          padding:"8px 14px",
          borderRadius:6,
          border:"1px solid #ccc",
          cursor:"pointer"
          }}
          >
          Close
          </button>

          </div>

          </div>

          </div>

      )}


      {editEntry && (

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
          zIndex:1000
          }}>

          <div style={{
          background:"#fff",
          padding:20,
          borderRadius:10,
          width:380
          }}>

          <h3 style={{marginBottom:12}}>Edit Description</h3>

          <textarea
          value={newDescription}
          onChange={e=>setNewDescription(e.target.value)}
          style={{
          width:"100%",
          padding:10,
          borderRadius:6,
          border:"1px solid #ccc",
          minHeight:80
          }}
          />

          <div style={{
          marginTop:12,
          display:"flex",
          gap:10
          }}>

          <button
          onClick={()=>setEditEntry(null)}
          style={{
          flex:1,
          padding:"8px",
          borderRadius:6,
          border:"1px solid #ccc"
          }}
          >
          Cancel
          </button>

          <button
          onClick={saveEdit}
          style={{
          flex:1,
          padding:"8px",
          borderRadius:6,
          border:"none",
          background:"#111",
          color:"#fff"
          }}
          >
          {savingEdit ? "Saving..." : "Save"}
          </button>

          </div>

          </div>

          </div>

      )}


      {reversingId && (
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
                Reversing entry...
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
          fontSize:14,
          zIndex:1000
          }}>

          {toast}

          </div>

          )}


      {duplicating && (

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
          borderRadius:10,
          fontWeight:600
          }}>

          Switching...

          </div>

          </div>

      )}


      </div>
    </div>

    );

}