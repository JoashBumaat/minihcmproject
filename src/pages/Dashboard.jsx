// src/pages/Dashboard.jsx
import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { useAttendance, useWeeklySummary } from "../hooks/useAttendance";
import { formatMinutes, getDateKey } from "../utils/hcmCompute";
import { useNavigate } from "react-router-dom";
import Sidebar from "../components/Sidebar";
import {
  collection, query, where, onSnapshot
} from "firebase/firestore";
import { db } from "../firebase";

function KPICard({ label, value, color = "var(--accent)" }) {
  return (
    <div className="kpi-card" style={{ "--kpi-color": color }}>
      <span className="kpi-label">{label}</span>
      <span className="kpi-value">{value}</span>
    </div>
  );
}

function MetricsRow({ summary }) {
  return (
    <div className="metrics-row">
      <KPICard label="Regular"    value={formatMinutes(summary.regularMinutes)}   color="var(--green)"  />
      <KPICard label="Overtime"   value={formatMinutes(summary.otMinutes)}        color="var(--blue)"   />
      <KPICard label="Night Diff" value={formatMinutes(summary.ndMinutes)}        color="var(--purple)" />
      <KPICard label="Late"       value={formatMinutes(summary.lateMinutes)}      color="var(--orange)" />
      <KPICard label="Undertime"  value={formatMinutes(summary.undertimeMinutes)} color="var(--red)"    />
    </div>
  );
}

// ─── Attendance History hook ──────────────────────────────
function useAttendanceHistory(userId) {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;

    const qSummary = query(
      collection(db, "dailySummary"),
      where("userId", "==", userId)
    );
    const qPairs = query(
      collection(db, "punchPairs"),
      where("userId", "==", userId)
    );

    let summaryMap = {};
    let pairsList  = [];

    function merge() {
      const pairsByDate = {};
      pairsList.forEach((p) => {
        if (!pairsByDate[p.date]) pairsByDate[p.date] = [];
        pairsByDate[p.date].push(p);
      });

      const rows = Object.keys(summaryMap).map((date) => {
        const s     = summaryMap[date];
        const pairs = pairsByDate[date] || [];
        const firstIn = pairs
          .filter((p) => p.timeIn)
          .sort((a, b) => a.timeIn.seconds - b.timeIn.seconds)[0];
        const lastOut = pairs
          .filter((p) => p.timeOut)
          .sort((a, b) => b.timeOut.seconds - a.timeOut.seconds)[0];

        return {
          date,
          punchIn:          firstIn?.timeIn?.toDate().toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit" }) || "—",
          punchOut:         lastOut?.timeOut?.toDate().toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit" }) || "—",
          regularMinutes:   s.regularMinutes   || 0,
          otMinutes:        s.otMinutes        || 0,
          ndMinutes:        s.ndMinutes        || 0,
          lateMinutes:      s.lateMinutes      || 0,
          undertimeMinutes: s.undertimeMinutes || 0,
          totalMinutes:     s.totalMinutes     || 0,
        };
      });

      rows.sort((a, b) => b.date.localeCompare(a.date));
      setHistory(rows);
      setLoading(false);
    }

    const unsubSummary = onSnapshot(qSummary, (snap) => {
      summaryMap = {};
      snap.docs.forEach((d) => { summaryMap[d.data().date] = d.data(); });
      merge();
    });

    const unsubPairs = onSnapshot(qPairs, (snap) => {
      pairsList = snap.docs.map((d) => d.data());
      merge();
    });

    return () => { unsubSummary(); unsubPairs(); };
  }, [userId]);

  return { history, loading };
}

export default function Dashboard() {
  const { userProfile } = useAuth();
  const [now, setNow]               = useState(new Date());
  const [punchMsg, setPunchMsg]     = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activePage, setActivePage] = useState("dashboard");

  const schedule = userProfile?.schedule || { start: "09:00", end: "18:00" };

  const { todayPunches, activePunch, loading, punchIn, punchOut, punchError } =
    useAttendance(userProfile?.id, schedule);

  const { summaries }                = useWeeklySummary(userProfile?.id);
  const { history, loading: histLoading } = useAttendanceHistory(userProfile?.id);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  async function handlePunch() {
    try {
      if (activePunch) {
        await punchOut();
        setPunchMsg("✓ Punched out successfully");
      } else {
        await punchIn();
        setPunchMsg("✓ Punched in successfully");
      }
      setTimeout(() => setPunchMsg(""), 3000);
    } catch (err) {
      setPunchMsg("Error: " + err.message);
    }
  }

  const todaySummary = summaries[0] || {};
  const isPunchedIn  = !!activePunch;
  const timeStr = now.toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const dateStr = now.toLocaleDateString("en-PH", { weekday: "long", year: "numeric", month: "long", day: "numeric" });

  return (
    <div className="app-shell">
      <Sidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        activePage={activePage}
        onNavigate={(page) => {
          // Only handle in-page nav (attendance-history stays on this route)
          if (page === "attendance-history" || page === "dashboard") {
            setActivePage(page);
          }
        }}
      />

      <main className="main-content">
        {/* Mobile Top Bar */}
        <div className="mobile-topbar">
          <button className="hamburger-btn" onClick={() => setSidebarOpen(true)}>☰</button>
          <span className="mobile-brand">⏱ Mini HCM - Time Tracking System</span>
          <div className="mobile-clock">{timeStr}</div>
        </div>

        {/* ══════════════ ATTENDANCE HISTORY PAGE ══════════════ */}
        {activePage === "attendance-history" && (
          <>
            <header className="page-header">
              <div>
                <h2 className="page-title">Attendance History</h2>
                <p className="page-sub">Your full attendance record</p>
              </div>
            </header>

            <section className="section">
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Punch In</th>
                      <th>Punch Out</th>
                      <th>Regular</th>
                      <th>OT</th>
                      <th>ND</th>
                      <th>Late</th>
                      <th>Undertime</th>
                    </tr>
                  </thead>
                  <tbody>
                    {histLoading ? (
                      <tr><td colSpan={8} className="empty-row">Loading…</td></tr>
                    ) : history.length === 0 ? (
                      <tr><td colSpan={8} className="empty-row">No attendance records yet</td></tr>
                    ) : (
                      history.map((h) => (
                        <tr key={h.date}>
                          <td style={{ fontWeight: 600 }}>{h.date}</td>
                          <td>
                            <span className="badge badge-green">{h.punchIn}</span>
                          </td>
                          <td>
                            <span className={`badge ${h.punchOut === "—" ? "badge-orange" : "badge-red"}`}>
                              {h.punchOut}
                            </span>
                          </td>
                          <td className="td-green">{formatMinutes(h.regularMinutes)}</td>
                          <td className="td-blue">{h.otMinutes > 0 ? formatMinutes(h.otMinutes) : "—"}</td>
                          <td className="td-purple">{h.ndMinutes > 0 ? formatMinutes(h.ndMinutes) : "—"}</td>
                          <td className="td-orange">{h.lateMinutes > 0 ? formatMinutes(h.lateMinutes) : "—"}</td>
                          <td className="td-red">{h.undertimeMinutes > 0 ? formatMinutes(h.undertimeMinutes) : "—"}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}

        {/* ══════════════ MAIN DASHBOARD PAGE ══════════════ */}
        {activePage === "dashboard" && (
          <>
            <header className="page-header">
              <div>
                <h2 className="page-title">My Dashboard</h2>
                <p className="page-sub">Schedule: {schedule.start} – {schedule.end}</p>
              </div>
              <div className="clock-display">
                <div className="clock-time">{timeStr}</div>
                <div className="clock-date">{dateStr}</div>
              </div>
            </header>

            {/* Punch Card */}
            <section className="punch-section">
              <div className={`punch-card ${isPunchedIn ? "punched-in" : ""}`}>
                <div className="punch-status-dot" />
                <div className="punch-status-text">
                  {isPunchedIn
                    ? `Clocked in since ${activePunch?.timestamp?.toDate().toLocaleTimeString()}`
                    : "Not clocked in"}
                </div>
                <button
                  className={`punch-btn ${isPunchedIn ? "punch-out" : "punch-in"}`}
                  onClick={handlePunch}
                  disabled={loading}
                >
                  {isPunchedIn ? "PUNCH OUT" : "PUNCH IN"}
                </button>
                {punchMsg   && <div className="punch-msg">{punchMsg}</div>}
                {punchError && <div className="punch-error">{punchError}</div>}
              </div>
            </section>

            {/* Today KPIs */}
            <section className="section">
              <h3 className="section-title">Today's Summary</h3>
              <MetricsRow summary={todaySummary} />
            </section>

            {/* Today's Punch Log */}
            <section className="section">
              <h3 className="section-title">Today's Punch Log</h3>
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr><th>#</th><th>Type</th><th>Time</th></tr>
                  </thead>
                  <tbody>
                    {todayPunches.length === 0 ? (
                      <tr><td colSpan={3} className="empty-row">No punches recorded today</td></tr>
                    ) : (
                      todayPunches.map((p, i) => (
                        <tr key={p.id}>
                          <td>{i + 1}</td>
                          <td>
                            <span className={`badge ${p.type === "in" ? "badge-green" : "badge-red"}`}>
                              {p.type === "in" ? "IN" : "OUT"}
                            </span>
                          </td>
                          <td>{p.timestamp?.toDate().toLocaleTimeString()}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Weekly History */}
            <section className="section">
              <h3 className="section-title">Weekly History (Last 7 Days)</h3>
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Regular</th>
                      <th>OT</th>
                      <th>Night Diff</th>
                      <th>Late</th>
                      <th>Undertime</th>
                      <th>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summaries.length === 0 ? (
                      <tr><td colSpan={7} className="empty-row">No records in the last 7 days</td></tr>
                    ) : (
                      summaries.map((s) => (
                        <tr key={s.id}>
                          <td>{s.date}</td>
                          <td className="td-green">{formatMinutes(s.regularMinutes)}</td>
                          <td className="td-blue">{formatMinutes(s.otMinutes)}</td>
                          <td className="td-purple">{formatMinutes(s.ndMinutes)}</td>
                          <td className="td-orange">{s.lateMinutes > 0 ? formatMinutes(s.lateMinutes) : "—"}</td>
                          <td className="td-red">{s.undertimeMinutes > 0 ? formatMinutes(s.undertimeMinutes) : "—"}</td>
                          <td>{formatMinutes(s.totalMinutes)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
