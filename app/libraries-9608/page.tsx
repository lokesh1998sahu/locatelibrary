"use client";

import { useState, useEffect } from "react";

export default function LibrariesPage() {

  const PASSWORD = process.env.NEXT_PUBLIC_LIBRARIES_PASSWORD;
  const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyWzuVGTo52BEOMpxefp5fBAxBAukESmqtK0JxhlHMFTZV9guTJ-rh19grWw8THDut64g/exec";

  const [tags, setTags] = useState<string[]>([]);
  const [codes, setCodes] = useState<{ code: string; name: string }[]>([]);
  const [pendingCount, setPendingCount] = useState(0);

  const [authorized, setAuthorized] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const [form, setForm] = useState({
    date: "",
    amount: "",
    paymentTag: "",
    libraryCode: "",
    remark: ""
  });

  const loadData = () => {
    fetch(`${SCRIPT_URL}?action=get`)
      .then(res => res.json())
      .then(data => {
        setTags(data.tags || []);
        setCodes(data.codes || []);
        setPendingCount(data.pendingCount || 0);
      })
      .catch(() => setMessage("Failed to load data"));
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    const savedAuth = localStorage.getItem("librariesAuthorized");
    if (savedAuth === "true") setAuthorized(true);
  }, []);

  const checkPassword = () => {
    if (passwordInput === PASSWORD) {
      setAuthorized(true);
      localStorage.setItem("librariesAuthorized", "true");
    } else {
      setMessage("Incorrect Password");
      setTimeout(() => setMessage(""), 2000);
    }
  };

  const handleSubmit = async (e: any) => {
    e.preventDefault();
    if (loading) return;

    if (!form.date || !form.amount || !form.paymentTag || !form.libraryCode) {
      setMessage("Please fill all required fields");
      setTimeout(() => setMessage(""), 2000);
      return;
    }

    const amountNumber = Number(form.amount);
    if (amountNumber === 0) {
      setMessage("Amount cannot be 0");
      setTimeout(() => setMessage(""), 2000);
      return;
    }

    try {
      setLoading(true);

      const response = await fetch(SCRIPT_URL, {
        method: "POST",
        body: JSON.stringify({
          date: form.date,
          amount: form.amount,
          paymentTag: form.paymentTag,
          libraryCode: form.libraryCode,
          remark: form.remark
        })
      });

      const result = await response.json();

      if (result.status === "success") {
        setForm({
          date: "",
          amount: "",
          paymentTag: "",
          libraryCode: "",
          remark: ""
        });

        setMessage("Entry Saved Successfully");
        setTimeout(() => setMessage(""), 2000);

        loadData();
      } else {
        setMessage("Something went wrong");
      }

    } catch {
      setMessage("Submission failed");
    }

    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-gray-200 flex items-center justify-center p-4">

      {loading && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl px-8 py-6 flex flex-col items-center shadow-xl">
            <div className="w-8 h-8 border-4 border-black border-t-transparent rounded-full animate-spin mb-4"></div>
            <p className="text-lg font-semibold text-gray-900">Processing...</p>
          </div>
        </div>
      )}

      <div className="bg-white shadow-2xl rounded-2xl w-full max-w-md p-6 border border-gray-300">

        {message && (
          <div className="mb-4 text-center text-sm font-medium text-green-700 bg-green-100 py-2 rounded-lg">
            {message}
          </div>
        )}

        {!authorized ? (
          <>
            <h2 className="text-2xl font-bold text-center mb-6 text-gray-900">
              Libraries Access Panel
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
              className="w-full bg-black text-white py-3 rounded-lg font-semibold"
            >
              Access
            </button>
          </>
        ) : (
          <>
            <div className="flex justify-between items-center mb-6">
              <h1 className="text-2xl font-bold text-gray-900">
                Fees Entry
              </h1>

              <button
                onClick={() => {
                  setAuthorized(false);
                  localStorage.removeItem("librariesAuthorized");
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
                  onChange={(e) => setForm({ ...form, date: e.target.value })}
                  onClick={(e: any) => {
                    if (e.target.showPicker) {
                      e.target.showPicker();
                    }
                  }}
                  required
                  className="flex-1 border border-gray-500 rounded-xl px-4 py-4 text-lg text-gray-900 cursor-pointer focus:outline-none focus:ring-2 focus:ring-black"
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
                className="w-full border border-gray-500 rounded-xl px-4 py-4 text-xl font-semibold text-gray-900 focus:outline-none focus:ring-2 focus:ring-black"
              />

              {/* Library Code */}
              <select
                value={form.libraryCode}
                onChange={(e) =>
                  setForm({ ...form, libraryCode: e.target.value })
                }
                required
                className="w-full border border-gray-500 rounded-xl px-4 py-4 text-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-black"
              >
                <option value="">Select Library Code</option>
                {codes.map((item, index) => (
                  <option key={index} value={item.code}>
                    {item.code} - {item.name}
                  </option>
                ))}
              </select>

              {/* Payment Tag */}
              <select
                value={form.paymentTag}
                onChange={(e) =>
                  setForm({ ...form, paymentTag: e.target.value })
                }
                required
                className="w-full border border-gray-500 rounded-xl px-4 py-4 text-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-black"
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
                className="w-full border border-gray-500 rounded-xl px-4 py-4 text-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-black"
              />

              {/* Submit */}
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-black text-white py-5 rounded-2xl text-lg font-bold"
              >
                Submit Entry
              </button>

              {/* Pending Counter */}
              <div className="mt-6 text-center select-none">
                <div className="bg-red-50 border border-red-200 rounded-xl py-3 px-4">
                  <span className="text-sm font-medium text-red-600">
                    Pending Receipts :
                  </span>
                  <span className="ml-2 text-xl font-bold text-red-700">
                    {pendingCount}
                  </span>
                </div>
              </div>

            </form>

            <div className="mt-8 text-center text-xs text-gray-500">
              YAL, KAL & SL - Internal Panel
            </div>
          </>
        )}
      </div>
    </div>
    );
}