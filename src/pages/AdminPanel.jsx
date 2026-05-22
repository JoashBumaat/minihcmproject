// src/pages/AdminPanel.jsx
import { useState, useEffect } from "react";
import {
  collection, query, onSnapshot,
  where, doc, updateDoc, Timestamp, getDoc
} from "firebase/firestore";
import { db } from "../firebase";
import { formatMinutes, getDateKey } from "../utils/hcmCompute";
import { updateDailySummary, useAdminWeeklySummaries } from "../hooks/useAttendance";
import { useAuth } from "../context/AuthContext";
import { useNavigate, useLocation } from "react-router-dom";
import Sidebar from "../components/Sidebar";

function getWeekLabel(weekOffset) {
  const today = new Date();
  const dayOfWeek = today.getDay(); // 0=Sun,1=Mon,...,6=Sat
  const daysToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const monday = new Date(today);
  monday.setDate(today.getDate() + daysToMonday + weekOffset * 7);
  monday.setHours(0, 0, 0, 0);

  const friday = new Date(monday);
  friday.setDate(monday.getDate() + 4);

  const opts = { month: "short", day: "numeric" };
  const start = monday.toLocaleDateString("en-PH", opts);
  const end   = friday.toLocaleDateString("en-PH", { ...opts, year: "numeric" });
  return `${start} – ${end}`;
}

export default function AdminPanel() {
  const { userProfile } = useAuth();
  const navigate        = useNavigate();
  const location        = useLocation();

  // Read ?tab= from URL on mount
  const initialTab = (() => {
    const params = new URLSearchParams(location.search);
    const t = params.get("tab");
    return ["daily", "weekly", "punches", "employees"].includes(t) ? t : "daily";
  })();

  const [tab,           setTab]           = useState(initialTab);
  const [users,         setUsers]         = useState([]);
  const [selectedDate,  setSelectedDate]  = useState(getDateKey(new Date()));
  const [dailySummaries,setDailySummaries]= useState([]);
  const [punches,       setPunches]       = useState([]);
  const [editingPunch,  setEditingPunch]  = useState(null);
  const [editTime,      setEditTime]      = useState("");
  const [userMap,       setUserMap]       = useState({});
  const [sidebarOpen,   setSidebarOpen]   = useState(false);
  const [weekOffset,    setWeekOffset]    = useState(0);

  const { summaries: weeklySummaries } = useAdminWeeklySummaries(weekOffset);

  // Sync tab when URL changes (e.g. sidebar Employee List link)
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const t = params.get("tab");
    if (["daily", "weekly", "punches", "employees"].includes(t)) {
      setTab(t);
    }
  }, [location.search]);

  useEffect(() => {
    const unsub = onSnapshot(query(collection(db, "users")), (snap) => {
      const list = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (a.name || "").localeCompare(b.name || ""));
      setUsers(list);
      const map = {};
      list.forEach((u) => (map[u.id] = u));
      setUserMap(map);
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (tab !== "daily") return;
    const q = query(collection(db, "dailySummary"), where("date", "==", selectedDate));
    const unsub = onSnapshot(q, (snap) => {
      setDailySummaries(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return unsub;
  }, [tab, selectedDate]);

  useEffect(() => {
    if (tab !== "punches") return;
    const q = query(collection(db, "attendance"), where("date", "==", selectedDate));
    const unsub = onSnapshot(q, (snap) => {
      const sorted = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => a.timestamp?.seconds - b.timestamp?.seconds);
      setPunches(sorted);
    });
    return unsub;
  }, [tab, selectedDate]);

  async function handleEditPunch(punch) {
    setEditingPunch(punch);
    const t = punch.timestamp.toDate();
    setEditTime(`${String(t.getHours()).padStart(2, "0")}:${String(t.getMinutes()).padStart(2, "0")}`);
  }

  async function savePunchEdit() {
    if (!editingPunch) return;
    const original = editingPunch.timestamp.toDate();
    const [h, m]   = editTime.split(":").map(Number);
    const updated  = new Date(original);
    updated.setHours(h, m, 0, 0);
    await updateDoc(doc(db, "attendance", editingPunch.id), {
      timestamp:     Timestamp.fromDate(updated),
      editedByAdmin: true,
    });
    const userSnap = await getDoc(doc(db, "users", editingPunch.userId));
    if (userSnap.exists()) {
      await updateDailySummary(editingPunch.userId, editingPunch.date, userSnap.data().schedule);
    }
    setEditingPunch(null);
  }

  function handleTabChange(t) {
    setTab(t);
    // Update URL without full navigation
    const params = new URLSearchParams(location.search);
    params.set("tab", t);
    navigate(`/admin?${params.toString()}`, { replace: true });
  }

  if (userProfile?.role !== "admin") {
    return (
      <div style={{ padding: "2rem", textAlign: "center" }}>
        <h2>Access Denied</h2>
        <p>You need admin role to view this page.</p>
      </div>
    );
  }

  const isCurrentWeek = weekOffset === 0;

  // Active sidebar page: if on employees tab, highlight employee-list
  const sidebarActivePage = tab === "employees" ? "employee-list" : "admin";

  return (
    <div className="app-shell">
      <Sidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        activePage={sidebarActivePage}
        onNavigate={(page) => {
          if (page === "employee-list") handleTabChange("employees");
          else if (page === "admin") handleTabChange("daily");
        }}
      />

      <main className="main-content">
        {/* Mobile Top Bar */}
        <div className="mobile-topbar">
          <button className="hamburger-btn" onClick={() => setSidebarOpen(true)}>☰</button>
          <span className="mobile-brand">⏱ Admin Panel</span>
          <div style={{ width: 40 }} />
        </div>

        <header className="page-header">
          <div>
            <h2 className="page-title">Admin Panel</h2>
            <p className="page-sub">{users.length} employees registered</p>
          </div>
          {(tab === "daily" || tab === "punches") && (
            <div className="date-picker-wrap">
              <label>Date:</label>
              <input
                type="date"
                value={selectedDate}
                max={getDateKey(new Date())}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="date-input"
              />
            </div>
          )}
        </header>

        {/* Tabs */}
        <div className="admin-tabs" style={{ marginBottom: "1.5rem" }}>
          {["daily", "weekly", "punches", "employees"].map((t) => (
            <button
              key={t}
              className={`admin-tab ${tab === t ? "active" : ""}`}
              onClick={() => handleTabChange(t)}
            >
              {t === "daily" ? "Daily Report"
               : t === "weekly" ? "Weekly Report"
               : t === "punches" ? "Punch Log"
               : "Employee List"}
            </button>
          ))}
        </div>

        {/* ── Daily Report ── */}
        {tab === "daily" && (
          <section className="section">
            <h3 className="section-title">Daily Summary — {selectedDate}</h3>
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Employee</th><th>Regular</th><th>OT</th>
                    <th>Night Diff</th><th>Late</th><th>Undertime</th><th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {dailySummaries.length === 0 ? (
                    <tr><td colSpan={7} className="empty-row">No records for {selectedDate}</td></tr>
                  ) : (
                    dailySummaries.map((s) => (
                      <tr key={s.id}>
                        <td>{userMap[s.userId]?.name || s.userId}</td>
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
        )}

        {/* ── Weekly Report ── */}
        {tab === "weekly" && (
          <section className="section">
            <div className="week-nav">
              <button
                className="week-nav-btn"
                onClick={() => setWeekOffset((w) => w - 1)}
              >
                ← Previous Week
              </button>
              <span className="week-nav-label">
                {isCurrentWeek ? "📅 Current Week" : getWeekLabel(weekOffset)}
              </span>
              {!isCurrentWeek && (
                <button
                  className="week-nav-btn"
                  onClick={() => setWeekOffset((w) => Math.min(0, w + 1))}
                >
                  Next Week →
                </button>
              )}
              {isCurrentWeek && <div className="week-nav-placeholder" />}
            </div>

            <h3 className="section-title" style={{ marginTop: "1rem" }}>
              Weekly Report — {getWeekLabel(weekOffset)}
            </h3>

            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Employee</th><th>Date</th><th>Regular</th><th>OT</th>
                    <th>Night Diff</th><th>Late</th><th>Undertime</th><th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {weeklySummaries.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="empty-row">
                        No records for {getWeekLabel(weekOffset)}
                      </td>
                    </tr>
                  ) : (
                    weeklySummaries.map((s) => (
                      <tr key={s.id}>
                        <td>{userMap[s.userId]?.name || s.userId}</td>
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
        )}

        {/* ── Punch Log ── */}
        {tab === "punches" && (
          <section className="section">
            <h3 className="section-title">Punch Log — {selectedDate}</h3>
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th>User ID</th>
                    <th>Type</th>
                    <th>Timestamp</th>
                    <th>Edited</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {punches.length === 0 ? (
                    <tr><td colSpan={6} className="empty-row">No punches for {selectedDate}</td></tr>
                  ) : (
                    punches.map((p) => (
                      <tr key={p.id}>
                        <td>{userMap[p.userId]?.name || "—"}</td>
                        <td style={{ fontFamily: "var(--mono)", fontSize: "0.72rem", color: "var(--text-muted)" }}>
                          {p.userId?.slice(0, 10)}…
                        </td>
                        <td>
                          <span className={`badge ${p.type === "in" ? "badge-green" : "badge-red"}`}>
                            {p.type === "in" ? "IN" : "OUT"}
                          </span>
                        </td>
                        <td style={{ fontFamily: "var(--mono)", fontSize: "0.82rem" }}>
                          {p.timestamp?.toDate().toLocaleTimeString("en-PH", {
                            hour: "2-digit", minute: "2-digit", second: "2-digit"
                          })}
                        </td>
                        <td>{p.editedByAdmin ? <span className="badge badge-orange">Edited</span> : "—"}</td>
                        <td><button className="edit-btn" onClick={() => handleEditPunch(p)}>Edit</button></td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {editingPunch && (
              <div className="modal-overlay" onClick={() => setEditingPunch(null)}>
                <div className="modal" onClick={(e) => e.stopPropagation()}>
                  <h3>Edit Punch Time</h3>
                  <p>
                    Employee: <strong>{userMap[editingPunch.userId]?.name}</strong><br />
                    User ID: <strong style={{ fontFamily: "var(--mono)", fontSize: "0.78rem" }}>{editingPunch.userId}</strong><br />
                    Type: <strong>{editingPunch.type.toUpperCase()}</strong><br />
                    Date: <strong>{editingPunch.date}</strong>
                  </p>
                  <div className="field-group">
                    <label>New Time</label>
                    <input type="time" value={editTime} onChange={(e) => setEditTime(e.target.value)} />
                  </div>
                  <div className="modal-actions">
                    <button className="submit-btn" onClick={savePunchEdit}>Save</button>
                    <button className="cancel-btn" onClick={() => setEditingPunch(null)}>Cancel</button>
                  </div>
                </div>
              </div>
            )}
          </section>
        )}

        {/* ── Employee List ── */}
        {tab === "employees" && (
          <section className="section">
            <h3 className="section-title">Employee List — {users.length} registered</h3>
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Role</th>
                    <th>Schedule</th>
                  </tr>
                </thead>
                <tbody>
                  {users.length === 0 ? (
                    <tr><td colSpan={5} className="empty-row">No employees registered yet</td></tr>
                  ) : (
                    users.map((u, i) => (
                      <tr key={u.id}>
                        <td>{i + 1}</td>
                        <td>
                          <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                            <div style={{
                              width: 30, height: 30, borderRadius: "50%",
                              background: u.role === "admin" ? "var(--accent)" : "var(--surface2)",
                              border: "1px solid var(--border)",
                              display: "flex", alignItems: "center", justifyContent: "center",
                              fontWeight: 700, fontSize: "0.8rem", flexShrink: 0,
                              color: u.role === "admin" ? "#fff" : "var(--text)"
                            }}>
                              {u.name?.[0]?.toUpperCase()}
                            </div>
                            <span style={{ fontWeight: 600 }}>{u.name}</span>
                          </div>
                        </td>
                        <td style={{ color: "var(--text-muted)", fontSize: "0.82rem" }}>{u.email}</td>
                        <td>
                          <span className={u.role === "admin" ? "badge badge-green" : "badge badge-orange"}>
                            {u.role}
                          </span>
                        </td>
                        <td style={{ fontFamily: "var(--mono)", fontSize: "0.82rem" }}>
                          {u.schedule?.start} – {u.schedule?.end}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
