// src/pages/AuthPage.jsx
import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useNavigate } from "react-router-dom";

const TIMEZONES = [
  "Asia/Manila",
  "Asia/Singapore",
  "Asia/Tokyo",
  "America/New_York",
  "America/Los_Angeles",
  "Europe/London",
  "UTC",
];

function friendlyError(msg) {
  if (msg.includes("api-key-not-valid") || msg.includes("api-key"))
    return "❌ Firebase API key is invalid. Please update src/firebase.js with your real Firebase config.";
  if (msg.includes("email-already-in-use"))
    return "This email is already registered. Please sign in instead.";
  if (msg.includes("invalid-credential") || msg.includes("wrong-password") || msg.includes("user-not-found"))
    return "Incorrect email or password. Please try again.";
  if (msg.includes("weak-password"))
    return "Password must be at least 6 characters.";
  if (msg.includes("network-request-failed"))
    return "No internet connection. Please check your network.";
  if (msg.includes("too-many-requests"))
    return "Too many attempts. Please wait a moment and try again.";
  return msg;
}

export default function AuthPage() {
  const [mode, setMode]                   = useState("login");
  const [registered, setRegistered]       = useState(false);
  const [registeredName, setRegisteredName]   = useState("");
  const [registeredEmail, setRegisteredEmail] = useState("");
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    timezone: "Asia/Manila",
    scheduleStart: "09:00",
    scheduleEnd: "18:00",
  });
  const [error,   setError]   = useState("");
  const [loading, setLoading] = useState(false);

  const { login, register } = useAuth();
  const navigate = useNavigate();

  function handleChange(e) {
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
    setError("");
  }

  function switchMode(m) {
    setMode(m);
    setError("");
    setRegistered(false);
    setForm({ name: "", email: "", password: "", timezone: "Asia/Manila", scheduleStart: "09:00", scheduleEnd: "18:00" });
  }

  // Called when user clicks "Login" on the success screen
  function goToLogin() {
    setRegistered(false);
    setMode("login");
    setError("");
    setForm((f) => ({ ...f, name: "", email: registeredEmail, password: "" }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (mode === "login") {
        await login(form.email, form.password);
        navigate("/dashboard");
      } else {
        // Register using secondary auth — main session stays untouched
        await register(form.email, form.password, {
          name:     form.name,
          role:     "employee",
          timezone: form.timezone,
          schedule: { start: form.scheduleStart, end: form.scheduleEnd },
        });
        // Save details for success screen
        setRegisteredName(form.name);
        setRegisteredEmail(form.email);
        // Show success screen — no auto-login
        setRegistered(true);
      }
    } catch (err) {
      setError(friendlyError(err.message));
    } finally {
      setLoading(false);
    }
  }

  // ── SUCCESS SCREEN ─────────────────────────────────────────
  if (registered) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <div className="success-screen">
            <div className="success-check">✅</div>
            <h2 className="success-title">Registered Successfully!</h2>
            <p className="success-desc">
              Welcome, <strong>{registeredName}</strong>!<br />
              Your employee account has been created.<br />
              Click the button below to sign in.
            </p>
            <button className="success-login-btn" onClick={goToLogin}>
              Login
            </button>
            <p className="switch-hint" style={{ marginTop: "1rem" }}>
              <span className="switch-link" onClick={() => switchMode("register")}>
                Register another account
              </span>
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ── LOGIN / REGISTER FORM ──────────────────────────────────
  return (
    <div className="auth-page">
      <div className="auth-card">

        <div className="auth-header">
          <div className="brand-mark">⏱</div>
          <h1 className="brand-name">Mini HCM</h1>
          <p className="brand-sub">Time Tracking System</p>
        </div>

        <div className="tab-row">
          <button
            className={`tab-btn ${mode === "login" ? "active" : ""}`}
            onClick={() => switchMode("login")}
          >Sign In</button>
          <button
            className={`tab-btn ${mode === "register" ? "active" : ""}`}
            onClick={() => switchMode("register")}
          >Register</button>
        </div>

        <form onSubmit={handleSubmit} className="auth-form">
          {mode === "register" && (
            <>
              <div className="field-group">
                <label>Full Name</label>
                <input
                  name="name"
                  value={form.name}
                  onChange={handleChange}
                  placeholder="e.g. Juan dela Cruz"
                  required
                  autoFocus
                />
              </div>
              <div className="field-group">
                <label>Timezone</label>
                <select name="timezone" value={form.timezone} onChange={handleChange}>
                  {TIMEZONES.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
                </select>
              </div>
              <div className="field-group">
                <label>Work Schedule</label>
                <div className="field-row">
                  <input type="time" name="scheduleStart" value={form.scheduleStart} onChange={handleChange} required />
                  <span className="time-sep">to</span>
                  <input type="time" name="scheduleEnd" value={form.scheduleEnd} onChange={handleChange} required />
                </div>
              </div>
            </>
          )}

          <div className="field-group">
            <label>Email Address</label>
            <input
              type="email"
              name="email"
              value={form.email}
              onChange={handleChange}
              placeholder="juan@company.com"
              required
              autoFocus={mode === "login"}
            />
          </div>

          <div className="field-group">
            <label>Password</label>
            <input
              type="password"
              name="password"
              value={form.password}
              onChange={handleChange}
              placeholder="••••••••"
              required
              minLength={6}
            />
          </div>

          {mode === "register" && (
            <p className="register-note">
              ℹ️ All new registrations are <strong>Employee</strong> accounts.
            </p>
          )}

          {error && <div className="error-box">{error}</div>}

          <button type="submit" className="submit-btn" disabled={loading}>
            {loading
              ? (mode === "login" ? "Signing in…" : "Creating account…")
              : (mode === "login" ? "Sign In →" : "Create Account")}
          </button>

          <p className="switch-hint">
            {mode === "login"
              ? <>No account yet? <span className="switch-link" onClick={() => switchMode("register")}>Register here</span></>
              : <>Already registered? <span className="switch-link" onClick={() => switchMode("login")}>Sign in here</span></>
            }
          </p>
        </form>
      </div>
    </div>
  );
}
