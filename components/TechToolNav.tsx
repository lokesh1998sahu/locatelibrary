"use client";

import Link from "next/link";
import { useState } from "react";

/**
 * TechToolNav — floating hub button
 * Add to any internal tool layout to get a persistent link back to /tech-tool.
 * Place: app/components/TechToolNav.tsx
 */
export default function TechToolNav() {
  const [pressed, setPressed] = useState(false);

  return (
    <>
      <style>{`
        .ttn-wrap {
          position: fixed;
          bottom: 24px;
          left: 16px;
          z-index: 9990;
          animation: ttn-in 0.4s cubic-bezier(0.16,1,0.3,1) both;
        }

        @keyframes ttn-in {
          from { opacity: 0; transform: translateY(10px) scale(0.9); }
          to   { opacity: 1; transform: translateY(0)   scale(1);   }
        }

        .ttn-btn {
          display: flex;
          align-items: center;
          gap: 7px;
          padding: 9px 14px 9px 10px;
          background: rgba(8, 10, 15, 0.88);
          border: 1px solid rgba(99, 102, 241, 0.35);
          border-radius: 100px;
          text-decoration: none;
          cursor: pointer;
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          box-shadow:
            0 4px 20px rgba(0,0,0,0.4),
            0 0 0 1px rgba(255,255,255,0.04) inset;
          transition: border-color 0.18s, box-shadow 0.18s, transform 0.15s;
          transform: ${pressed ? "scale(0.95)" : "scale(1)"};
        }

        .ttn-btn:hover {
          border-color: rgba(99, 102, 241, 0.65);
          box-shadow:
            0 6px 28px rgba(99,102,241,0.2),
            0 0 0 1px rgba(255,255,255,0.06) inset;
        }

        .ttn-grid {
          width: 22px;
          height: 22px;
          display: grid;
          grid-template-columns: 1fr 1fr;
          grid-template-rows: 1fr 1fr;
          gap: 3px;
          flex-shrink: 0;
        }

        .ttn-dot {
          border-radius: 2.5px;
        }

        .ttn-label {
          font-family: 'DM Sans', 'DM Mono', sans-serif;
          font-size: 12px;
          font-weight: 700;
          color: #a5b4fc;
          letter-spacing: 0.3px;
          white-space: nowrap;
        }
      `}</style>

      <div className="ttn-wrap">
        <Link
          href="/tech-tool"
          className="ttn-btn"
          onMouseDown={() => setPressed(true)}
          onMouseUp={() => setPressed(false)}
          onTouchStart={() => setPressed(true)}
          onTouchEnd={() => setPressed(false)}
        >
          {/* Mini 4-grid icon matching the tech-tool logo */}
          <div className="ttn-grid">
            <div className="ttn-dot" style={{ background: "#6366f1" }} />
            <div className="ttn-dot" style={{ background: "#34d399" }} />
            <div className="ttn-dot" style={{ background: "#e8a833" }} />
            <div className="ttn-dot" style={{ background: "#f472b6" }} />
          </div>
          <span className="ttn-label">Tech Tool</span>
        </Link>
      </div>
    </>
  );
}