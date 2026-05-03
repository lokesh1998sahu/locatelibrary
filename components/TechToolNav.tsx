"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function TechToolNav() {
  const [pressed, setPressed] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const router = useRouter();

  const handleNavigate = () => {
    setShowConfirm(false);
    router.push("/tech-tool");
  };

  return (
    <>
      <style>{`
        .ttn-wrap {
          position: fixed;
          bottom: 24px;
          left: 16px;
          z-index: 9990;
        }

        .ttn-btn {
          display: flex;
          align-items: center;
          gap: 7px;
          padding: 9px 14px 9px 10px;
          background: rgba(8, 10, 15, 0.88);
          border: 1px solid rgba(99, 102, 241, 0.35);
          border-radius: 100px;
          cursor: pointer;
          backdrop-filter: blur(12px);
          box-shadow:
            0 4px 20px rgba(0,0,0,0.4),
            0 0 0 1px rgba(255,255,255,0.04) inset;
          transition: all 0.2s;
          transform: ${pressed ? "scale(0.95)" : "scale(1)"};
        }

        .ttn-btn:hover {
          border-color: rgba(99, 102, 241, 0.65);
          box-shadow:
            0 6px 28px rgba(99,102,241,0.2),
            0 0 0 1px rgba(255,255,255,0.06) inset;
        }

        .ttn-label {
          font-size: 12px;
          font-weight: 700;
          color: #a5b4fc;
        }

        /* Modal backdrop */
        .ttn-modal-bg {
          position: fixed;
          inset: 0;
          background: rgba(0,0,0,0.45);
          backdrop-filter: blur(6px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 9999;
          animation: fadeIn 0.2s ease;
        }

        /* Modal box */
        .ttn-modal {
          width: 280px;
          padding: 20px;
          border-radius: 18px;
          background: rgba(15, 18, 25, 0.9);
          border: 1px solid rgba(99,102,241,0.3);
          backdrop-filter: blur(16px);
          box-shadow:
            0 10px 40px rgba(0,0,0,0.5),
            0 0 0 1px rgba(255,255,255,0.05) inset;
          text-align: center;
          animation: scaleIn 0.25s ease;
        }

        .ttn-title {
          font-size: 14px;
          font-weight: 700;
          color: #e0e7ff;
          margin-bottom: 8px;
        }

        .ttn-sub {
          font-size: 12px;
          color: #9ca3af;
          margin-bottom: 16px;
        }

        .ttn-actions {
          display: flex;
          gap: 10px;
        }

        .ttn-cancel, .ttn-confirm {
          flex: 1;
          padding: 8px;
          border-radius: 10px;
          font-size: 12px;
          cursor: pointer;
          border: none;
        }

        .ttn-cancel {
          background: rgba(255,255,255,0.05);
          color: #d1d5db;
        }

        .ttn-confirm {
          background: #6366f1;
          color: white;
          font-weight: 600;
        }

        .ttn-confirm:hover {
          background: #4f46e5;
        }

        @keyframes fadeIn {
          from { opacity: 0 }
          to { opacity: 1 }
        }

        @keyframes scaleIn {
          from { transform: scale(0.9); opacity: 0 }
          to { transform: scale(1); opacity: 1 }
        }
      `}</style>

      {/* Floating Button */}
      <div className="ttn-wrap">
        <div
          className="ttn-btn"
          onClick={() => setShowConfirm(true)}
          onMouseDown={() => setPressed(true)}
          onMouseUp={() => setPressed(false)}
          onTouchStart={() => setPressed(true)}
          onTouchEnd={() => setPressed(false)}
        >
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 3 }}>
            <div style={{ width: 8, height: 8, background: "#6366f1" }} />
            <div style={{ width: 8, height: 8, background: "#34d399" }} />
            <div style={{ width: 8, height: 8, background: "#e8a833" }} />
            <div style={{ width: 8, height: 8, background: "#f472b6" }} />
          </div>
          <span className="ttn-label">Tech Tool</span>
        </div>
      </div>

      {/* Confirmation Modal */}
      {showConfirm && (
        <div className="ttn-modal-bg">
          <div className="ttn-modal">
            <div className="ttn-title">Go to Tech Tool?</div>
            <div className="ttn-sub">
              Unsaved work may be lost.
            </div>

            <div className="ttn-actions">
              <button
                className="ttn-cancel"
                onClick={() => setShowConfirm(false)}
              >
                Cancel
              </button>

              <button
                className="ttn-confirm"
                onClick={handleNavigate}
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}