"use client";

import { useState } from "react";

export default function Hero() {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const handleSubmit = async (
    e: React.FormEvent<HTMLFormElement>
  ) => {
    e.preventDefault();
    setLoading(true);
    setMessage("");

    const form = e.currentTarget; // store reference safely
    const formData = new FormData(form);

    const email = formData.get("email");
    const company = formData.get("company");

    try {
      const res = await fetch("/api/subscribe", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, company }),
      });

      if (!res.ok) {
        throw new Error("Server response not OK");
      }

      const data = await res.json();
      const responseMessage =
        typeof data.message === "string"
          ? data.message.trim()
          : "";

      if (responseMessage.toLowerCase() === "success") {
        setMessage("You're on the list 🎉");
        form.reset(); // safe reset
      } else {
        setMessage(responseMessage || "Submission failed");
      }

    } catch (error) {
      console.error("Submit error:", error);
      setMessage("Something went wrong. Try again.");
    }

    setLoading(false);
  };

  return (
    <div className="w-full bg-[#0f172a] text-white">

      {/* HERO */}
      <section className="relative min-h-screen flex items-center justify-center px-6 text-center overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-[#0f172a] via-[#111827] to-[#0f172a]" />
        <div className="absolute -top-60 left-1/2 -translate-x-1/2 w-[900px] h-[900px] bg-indigo-600/20 rounded-full blur-3xl" />

        <div className="relative max-w-4xl">
          <h1 className="text-7xl md:text-8xl font-black tracking-tight leading-[0.95]">
            Locate Library
          </h1>

          <p className="mt-8 text-indigo-400 uppercase tracking-[0.4em] text-sm font-semibold">
            Launching Soon
          </p>

          <p className="mt-10 text-gray-300 text-xl max-w-2xl mx-auto leading-relaxed">
            Discover, compare and book premium study libraries near you —
            all in one intelligent platform.
          </p>

          <div className="mt-14">
            <a href="#notify">
              <button className="px-12 py-4 bg-indigo-600 text-white rounded-full text-lg font-semibold hover:bg-indigo-500 transition shadow-xl shadow-indigo-600/30">
                Get Notified
              </button>
            </a>
          </div>
        </div>
      </section>

      {/* NOTIFY */}
      <section
        id="notify"
        className="py-28 px-6 border-t border-white/10 bg-[#111827] text-center"
      >
        <h2 className="text-3xl font-bold">
          Stay Updated
        </h2>

        <p className="mt-4 text-gray-400">
          Enter your email and we’ll notify you when we launch.
        </p>

        <form
          onSubmit={handleSubmit}
          className="mt-10 flex flex-col sm:flex-row justify-center gap-4"
        >
          <input
            name="email"
            type="email"
            required
            placeholder="Enter your email"
            className="px-6 py-3 rounded-full border border-white/10 bg-[#0f172a] text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 w-full sm:w-80"
          />

          {/* Honeypot */}
          <input
            name="company"
            type="text"
            className="hidden"
            autoComplete="off"
          />

          <button
            type="submit"
            disabled={loading}
            className="px-8 py-3 bg-indigo-600 text-white rounded-full font-semibold hover:bg-indigo-500 transition shadow-lg shadow-indigo-600/20 disabled:opacity-50"
          >
            {loading ? "Submitting..." : "Notify Me"}
          </button>
        </form>

        {message && (
          <p className="mt-6 text-indigo-400 text-sm">
            {message}
          </p>
        )}
      </section>

      {/* FOOTER */}
      <footer className="py-10 text-center border-t border-white/10 text-gray-500 text-sm bg-[#0f172a]">
        © {new Date().getFullYear()} Locate Library. All rights reserved.
      </footer>

    </div>
  );
}