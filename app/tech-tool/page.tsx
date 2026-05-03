"use client";

import { useState, useEffect } from "react";

const tools = [
  {
    id: "libraries-9608",
    label: "Fees Entry Panel",
    description: "Fee management & receipt ledger for all branches",
    href: "/libraries-9608",
    emoji: "📚",
    accent: "#e8a833",
    accentDim: "rgba(232,168,51,0.10)",
    accentBorder: "rgba(232,168,51,0.22)",
    tag: "FINANCE",
  },
    {
    id: "admissions",
    label: "Library Admissions",
    description: "Student receipts, renewals, dues & board tracking",
    href: "/admissions",
    emoji: "🎓",
    accent: "#6366f1",
    accentDim: "rgba(99,102,241,0.12)",
    accentBorder: "rgba(99,102,241,0.25)",
    tag: "LIBRARY OPS",
  },
  
    {
    id: "owner",
    label: "Cleaning Tracker",
    description: "Master dashboard for business analytics & controls",
    href: "/owner",
    emoji: "👑",
    accent: "#f472b6",
    accentDim: "rgba(244,114,182,0.09)",
    accentBorder: "rgba(244,114,182,0.22)",
    tag: "ADMIN",
  },
  {
    id: "mf-2",
    label: "My Financials 2.0",
    description: "Personal finance dashboard & transaction tracker",
    href: "/mf-2",
    emoji: "₹",
    emojiMono: true,
    accent: "#34d399",
    accentDim: "rgba(52,211,153,0.09)",
    accentBorder: "rgba(52,211,153,0.22)",
    tag: "PERSONAL",
  },
  {
    id: "home",
    label: "Locate Library",
    description: "Public-facing homepage for students & visitors",
    href: "/",
    emoji: "🗺️",
    accent: "#22d3ee",
    accentDim: "rgba(34,211,238,0.09)",
    accentBorder: "rgba(34,211,238,0.22)",
    tag: "PUBLIC",
  },
];

export default function TechToolPage() {
  const [mounted, setMounted] = useState(false);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;0,9..40,800;1,9..40,400&family=DM+Mono:wght@400;500;600&display=swap');

        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        :root {
          --bg: #080a0f;
          --surface: #0f1219;
          --surface2: #161c27;
          --border: #1e2535;
          --border2: #252e42;
          --cream: #e8edf5;
          --muted: #4a5568;
          --muted2: #7a8499;
          --font: 'DM Sans', sans-serif;
          --mono: 'DM Mono', monospace;
        }

        body {
          background: var(--bg);
          font-family: var(--font);
          color: var(--cream);
          min-height: 100vh;
          -webkit-font-smoothing: antialiased;
        }

        .page {
          min-height: 100vh;
          display: flex;
          flex-direction: column;
          position: relative;
          overflow: hidden;
        }

        /* Ambient glow blobs */
        .blob {
          position: fixed;
          border-radius: 50%;
          filter: blur(120px);
          pointer-events: none;
          z-index: 0;
          opacity: 0.35;
        }
        .blob-1 {
          width: 500px; height: 500px;
          background: rgba(99,102,241,0.18);
          top: -180px; right: -140px;
        }
        .blob-2 {
          width: 400px; height: 400px;
          background: rgba(232,168,51,0.10);
          bottom: -100px; left: -120px;
        }

        /* Noise overlay */
        .noise {
          position: fixed; inset: 0; z-index: 0; pointer-events: none;
          background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='1'/%3E%3C/svg%3E");
          opacity: 0.03;
        }

        /* Header */
        .header {
          position: relative; z-index: 10;
          padding: 28px 24px 0;
          max-width: 540px;
          margin: 0 auto;
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .brand {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .brand-dot {
          width: 8px; height: 8px;
          border-radius: 50%;
          background: #6366f1;
          box-shadow: 0 0 10px rgba(99,102,241,0.7);
          animation: pulse 2.5s ease-in-out infinite;
        }

        @keyframes pulse {
          0%, 100% { opacity: 1; box-shadow: 0 0 10px rgba(99,102,241,0.7); }
          50% { opacity: 0.5; box-shadow: 0 0 4px rgba(99,102,241,0.3); }
        }

        .brand-name {
          font-family: var(--mono);
          font-size: 12px;
          font-weight: 600;
          color: var(--muted2);
          letter-spacing: 1.5px;
          text-transform: uppercase;
        }

        .version-badge {
          font-family: var(--mono);
          font-size: 10px;
          font-weight: 500;
          color: var(--muted);
          background: var(--surface2);
          border: 1px solid var(--border);
          border-radius: 6px;
          padding: 4px 9px;
          letter-spacing: 0.5px;
        }

        /* Hero */
        .hero {
          position: relative; z-index: 10;
          max-width: 540px;
          margin: 0 auto;
          width: 100%;
          padding: 40px 24px 28px;
        }

        .hero-eyebrow {
          font-family: var(--mono);
          font-size: 10px;
          font-weight: 600;
          letter-spacing: 2.5px;
          text-transform: uppercase;
          color: var(--muted);
          margin-bottom: 12px;
        }

        .hero-title {
          font-size: 36px;
          font-weight: 800;
          color: var(--cream);
          line-height: 1.1;
          letter-spacing: -1.2px;
          margin-bottom: 10px;
        }

        .hero-title span {
          background: linear-gradient(135deg, #6366f1, #a78bfa);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        .hero-sub {
          font-size: 14px;
          color: var(--muted2);
          line-height: 1.6;
          font-weight: 400;
        }

        /* Divider line */
        .divider {
          max-width: 540px;
          margin: 0 auto 20px;
          padding: 0 24px;
          position: relative; z-index: 10;
        }

        .divider-line {
          height: 1px;
          background: linear-gradient(90deg, transparent, var(--border2) 30%, var(--border2) 70%, transparent);
        }

        /* Tool grid */
        .tools {
          position: relative; z-index: 10;
          max-width: 540px;
          margin: 0 auto;
          width: 100%;
          padding: 0 14px 40px;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .tool-card {
          display: flex;
          align-items: center;
          gap: 16px;
          padding: 18px 20px;
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 16px;
          cursor: pointer;
          text-decoration: none;
          color: inherit;
          transition: border-color 0.2s, background 0.2s, transform 0.18s;
          position: relative;
          overflow: hidden;
        }

        .tool-card::before {
          content: '';
          position: absolute;
          inset: 0;
          opacity: 0;
          transition: opacity 0.2s;
          pointer-events: none;
        }

        .tool-card:hover {
          transform: translateY(-1px);
        }

        .tool-card:active {
          transform: translateY(0) scale(0.99);
        }

        .tool-icon {
          width: 48px; height: 48px;
          border-radius: 13px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 22px;
          flex-shrink: 0;
          transition: transform 0.2s;
        }

        .tool-icon.mono {
          font-family: var(--mono);
          font-size: 20px;
          font-weight: 800;
        }

        .tool-card:hover .tool-icon {
          transform: scale(1.08);
        }

        .tool-content { flex: 1; min-width: 0; }

        .tool-header {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 3px;
        }

        .tool-name {
          font-size: 15px;
          font-weight: 700;
          color: var(--cream);
        }

        .tool-tag {
          font-family: var(--mono);
          font-size: 9px;
          font-weight: 600;
          letter-spacing: 1px;
          padding: 2px 7px;
          border-radius: 5px;
          text-transform: uppercase;
        }

        .tool-desc {
          font-size: 12px;
          color: var(--muted2);
          line-height: 1.5;
          font-weight: 400;
        }

        .tool-arrow {
          font-size: 16px;
          color: var(--muted);
          flex-shrink: 0;
          transition: transform 0.18s, color 0.18s;
        }

        .tool-card:hover .tool-arrow {
          transform: translateX(3px);
        }

        /* Footer */
        .footer {
          position: relative; z-index: 10;
          max-width: 540px;
          margin: 0 auto;
          width: 100%;
          padding: 0 24px 32px;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .footer-text {
          font-family: var(--mono);
          font-size: 10px;
          color: var(--muted);
          letter-spacing: 0.5px;
        }

        .footer-dot {
          width: 5px; height: 5px;
          border-radius: 50%;
          background: var(--border2);
        }

        /* Mount animation */
        @keyframes fadeSlide {
          from { opacity: 0; transform: translateY(14px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        .animate-item {
          animation: fadeSlide 0.45s cubic-bezier(0.16,1,0.3,1) both;
        }
      `}</style>

      <div className="page">
        <div className="blob blob-1" />
        <div className="blob blob-2" />
        <div className="noise" />

        {/* Header */}
        <div className="header animate-item" style={{ animationDelay: "0ms" }}>
          <div className="brand">
            <div className="brand-dot" />
            <span className="brand-name">Locate Library</span>
          </div>
          <span className="version-badge">TECH-TOOL</span>
        </div>

        {/* Hero */}
        <div className="hero animate-item" style={{ animationDelay: "60ms" }}>
          <div className="hero-eyebrow">Internal Tools Dashboard</div>
          <div className="hero-title">
            Your <span>command</span><br />centre.
          </div>
          <div className="hero-sub">
            All operational tools in one place — admissions, finance, and management.
          </div>
        </div>

        {/* Divider */}
        <div className="divider animate-item" style={{ animationDelay: "100ms" }}>
          <div className="divider-line" />
        </div>

        {/* Tools */}
        <div className="tools">
          {tools.map((tool, i) => (
            <a
              key={tool.id}
              href={tool.href}
              className="tool-card animate-item"
              style={{
                animationDelay: `${120 + i * 55}ms`,
                borderColor: hoveredId === tool.id ? tool.accentBorder : undefined,
                background: hoveredId === tool.id ? tool.accentDim : undefined,
              }}
              onMouseEnter={() => setHoveredId(tool.id)}
              onMouseLeave={() => setHoveredId(null)}
            >
              <div
                className={`tool-icon${tool.emojiMono ? " mono" : ""}`}
                style={{
                  background: tool.accentDim,
                  border: `1.5px solid ${tool.accentBorder}`,
                  color: tool.accent,
                }}
              >
                {tool.emoji}
              </div>

              <div className="tool-content">
                <div className="tool-header">
                  <span className="tool-name">{tool.label}</span>
                  <span
                    className="tool-tag"
                    style={{
                      background: tool.accentDim,
                      color: tool.accent,
                      border: `1px solid ${tool.accentBorder}`,
                    }}
                  >
                    {tool.tag}
                  </span>
                </div>
                <div className="tool-desc">{tool.description}</div>
              </div>

              <span
                className="tool-arrow"
                style={{ color: hoveredId === tool.id ? tool.accent : undefined }}
              >
                →
              </span>
            </a>
          ))}
        </div>

        {/* Footer */}
        <div className="footer animate-item" style={{ animationDelay: "440ms" }}>
          <span className="footer-text">LOCATELIBRARY.COM / TECH-TOOL</span>
          <div className="footer-dot" />
          <span className="footer-text">{mounted ? new Date().getFullYear() : ""}</span>
        </div>
      </div>
    </>
  );
}