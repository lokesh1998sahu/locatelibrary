"use client";

import { useState, useEffect } from "react";

export default function KLPage() {

  const PASSWORD = process.env.NEXT_PUBLIC_KL_PASSWORD;

  const [tags, setTags] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [authorized, setAuthorized] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

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
      .then(data => setTags(data.tags))
      .catch(() => setSuccessMessage("Failed to load payment tags"));
  }, []);

  // Restore auth
  useEffect(() => {
    const savedAuth = localStorage.getItem("klAuthorized");
    if (savedAuth === "true") setAuthorized(true);
  }, []);

  const checkPassword = () => {
    if (passwordInput === PASSWORD) {
      setAuthorized(true);
      localStorage.setItem("klAuthorized", "true");
    } else {
      setSuccessMessage("Incorrect Password");
      setTimeout(() => setSuccessMessage(""), 2000);
    }
  };

  const handleSubmit = async (e: any) => {
    e.preventDefault();
    if (loading) return;

    if (!form.date || !form.amount || !form.paymentTag) {
      setSuccessMessage("Please fill all required fields");
      setTimeout(() => setSuccessMessage(""), 2000);
      return;
    }

    const amountNumber = Number(form.amount);
    if (amountNumber === 0) {
      setSuccessMessage("Amount cannot be 0");
      setTimeout(() => setSuccessMessage(""), 2000);
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
        setForm({
          date: "",
          amount: "",
          paymentTag: "",
          remark: ""
        });

        setSuccessMessage("Entry Saved Successfully");
        setTimeout(() => setSuccessMessage(""), 2000);
      } else {
        setSuccessMessage("Something went wrong");
        setTimeout(() => setSuccessMessage(""), 2000);
      }

    } catch {
      setSuccessMessage("Submission failed");
      setTimeout(() => setSuccessMessage(""), 2000);
    }

    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-gray-200 flex items-center justify-center p-4">

      <div className="bg-white shadow-2xl rounded-2xl w-full max-w-md p-6 border border-gray-300">

        {successMessage && (
          <div className="mb-4 text-center text-sm font-medium text-green-700 bg-green-100 py-2 rounded-lg">
            {successMessage}
          </div>
        )}

        {!authorized ? (
          <>
            <h2 className="text-2xl font-bold text-center mb-6 text-gray-900">
              KL Access Panel
            </h2>

            <input
              type="password"
              placeholder="Enter Access Code"
              value={passwordInput}
              onChange={(e) => setPasswordInput(e.target.value)}
              className="w-full border border-gray-400 rounded-lg px-3 py-3 mb-4 text-gray-900 focus:outline-none focus:ring-2 focus:ring-black"
            />

            <button
              onClick={checkPassword}
              className="w-full bg-black text-white py-3 rounded-lg font-semibold hover:opacity-90 transition"
            >
              Access
            </button>
          </>
        ) : (
          <>
            <div className="flex justify-between items-center mb-6">
              <h1 className="text-2xl font-bold text-gray-900">
                KL Fees Entry
              </h1>

              <button
                onClick={() => {
                  setAuthorized(false);
                  localStorage.removeItem("klAuthorized");
                }}
                className="text-sm font-medium text-red-600 hover:underline"
              >
                Logout
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">

  {/* Date + Today */}
  <div className="flex gap-2">
    <input
      type="date"
      value={form.date}
      onChange={(e) =>
        setForm({ ...form, date: e.target.value })
      }
      onClick={(e: any) => {
        if (e.target.showPicker) {
          e.target.showPicker();
        }
      }}
      required
      className="flex-1 border border-gray-500 rounded-xl px-4 py-4 text-lg text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-black"
    />

    <button
      type="button"
      onClick={() => {
        const today = new Date().toISOString().split("T")[0];
        setForm({ ...form, date: today });
      }}
      className="px-4 py-4 bg-black text-white rounded-xl text-sm font-semibold active:scale-95 transition"
    >
      Today
    </button>
  </div>

  {/* Amount */}
  <input
    type="number"
    placeholder="Enter Amount"
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
    inputMode="numeric"
    className="w-full border border-gray-500 rounded-xl px-4 py-4 text-xl font-semibold text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-black"
  />

  {/* Payment Tag */}
  <select
    value={form.paymentTag}
    onChange={(e) =>
      setForm({ ...form, paymentTag: e.target.value })
    }
    required
    className="w-full border border-gray-500 rounded-xl px-4 py-4 text-lg text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-black"
  >
    <option value="">Select Payment Tag</option>
    {tags.map((tag, index) => (
      <option key={index} value={tag}>
        {tag}
      </option>
    ))}
  </select>

  {/* Remark */}
  <input
    type="text"
    placeholder="Remark (Optional)"
    value={form.remark}
    onChange={(e) =>
      setForm({ ...form, remark: e.target.value })
    }
    className="w-full border border-gray-500 rounded-xl px-4 py-4 text-lg text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-black"
  />

  {/* Sticky Submit */}
  <div className="pt-4">
    <button
      type="submit"
      disabled={loading}
      className="w-full bg-black text-white py-5 rounded-2xl text-lg font-bold active:scale-95 transition disabled:opacity-50"
    >
      {loading ? "Saving..." : "Submit Entry"}
    </button>
  </div>

</form>
          </>
        )}
      </div>
    </div>
  );
}