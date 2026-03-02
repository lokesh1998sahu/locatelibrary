"use client";

import { useState, useEffect } from "react";

export default function KLPage() {

  const [tags, setTags] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [authorized, setAuthorized] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");

  const [form, setForm] = useState({
    date: "",
    amount: "",
    paymentTag: "",
    remark: ""
  });

  // Load payment tags
  useEffect(() => {
    fetch("https://script.google.com/macros/s/AKfycbwV5B1buaIIzhtWqp3MHbt6on2Pul6_VfZteQSIrqojQPsSnXp5bcZs9ooEOk-DXdk/exec?action=get")
      .then(res => res.json())
      .then(data => {
        setTags(data.tags);
      })
      .catch((error) => {
        console.error(error);
        alert("Failed to load payment tags");
      });
  }, []);

  // Restore authorization from localStorage
  useEffect(() => {
    const savedAuth = localStorage.getItem("klAuthorized");
    if (savedAuth === "true") {
      setAuthorized(true);
    }
  }, []);

  const checkPassword = () => {
    if (passwordInput === "KL1705") {
      setAuthorized(true);
      localStorage.setItem("klAuthorized", "true");
    } else {
      alert("Incorrect Password");
    }
  };

  const handleSubmit = async (e: any) => {
    e.preventDefault();
    if (loading) return;

    if (!form.date || !form.amount || !form.paymentTag) {
      alert("Please fill all required fields");
      return;
    }

    const amountNumber = Number(form.amount);

    if (amountNumber === 0) {
      alert("Amount cannot be 0");
      return;
    }

    try {
      setLoading(true);

      const response = await fetch(
        "https://script.google.com/macros/s/AKfycbwV5B1buaIIzhtWqp3MHbt6on2Pul6_VfZteQSIrqojQPsSnXp5bcZs9ooEOk-DXdk/exec",
        {
          method: "POST",
          body: JSON.stringify({
            date: form.date,
            amount: form.amount,
            paymentTag: form.paymentTag,
            remark: form.remark
          })
        }
      );

      const result = await response.json();

      if (result.status === "success") {
        alert("Entry Saved Successfully");

        setForm({
          date: "",
          amount: "",
          paymentTag: "",
          remark: ""
        });
      } else {
        alert("Something went wrong");
      }

      setLoading(false);

    } catch (error) {
      console.error(error);
      alert("Submission failed");
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: "40px", maxWidth: "400px" }}>
      {!authorized ? (
        <>
          <h2>Enter Password</h2>

          <input
            type="password"
            placeholder="Enter Access Code"
            value={passwordInput}
            onChange={(e) => setPasswordInput(e.target.value)}
          />

          <button onClick={checkPassword}>Access</button>
        </>
      ) : (
        <>
          <button
            onClick={() => {
              setAuthorized(false);
              localStorage.removeItem("klAuthorized");
            }}
            style={{ marginBottom: "10px" }}
          >
            Logout
          </button>

          <h1>KL Fees Entry</h1>

          <form
            onSubmit={handleSubmit}
            style={{ display: "flex", flexDirection: "column", gap: "15px" }}
          >

            <input
              type="date"
              value={form.date}
              onChange={(e) =>
                setForm({ ...form, date: e.target.value })
              }
              required
            />

            <input
              type="number"
              placeholder="Amount"
              value={form.amount}
              onChange={(e) => {
                const value = e.target.value;

                if (value === "") {
                  setForm({ ...form, amount: "" });
                  return;
                }

                if (/^-?\d+$/.test(value)) {
                  setForm({ ...form, amount: value });
                }
              }}
              required
            />

            <select
              value={form.paymentTag}
              onChange={(e) =>
                setForm({ ...form, paymentTag: e.target.value })
              }
              required
            >
              <option value="">Select Payment Tag</option>
              {tags.map((tag, index) => (
                <option key={index} value={tag}>
                  {tag}
                </option>
              ))}
            </select>

            <input
              type="text"
              placeholder="Remark (Optional)"
              value={form.remark}
              onChange={(e) =>
                setForm({ ...form, remark: e.target.value })
              }
            />

            <button type="submit" disabled={loading}>
              {loading ? "Saving..." : "Submit"}
            </button>

          </form>
        </>
      )}
    </div>
  );
}