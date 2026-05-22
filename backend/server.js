// backend/server.js
const express = require("express");
const cors = require("cors");
const admin = require("firebase-admin");

// Initialize Firebase Admin
// Download your service account key from Firebase Console > Project Settings > Service Accounts
// Then set: GOOGLE_APPLICATION_CREDENTIALS=path/to/serviceAccountKey.json
admin.initializeApp({
  credential: admin.credential.applicationDefault(),
});

const db = admin.firestore();
const app = express();
app.use(cors());
app.use(express.json());

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseTime(str) {
  const [h, m] = str.split(":").map(Number);
  return h * 60 + m;
}

function formatMinutes(mins) {
  if (!mins || mins <= 0) return "0h 0m";
  const h = Math.floor(Math.abs(mins) / 60);
  const m = Math.abs(mins) % 60;
  return `${h}h ${m}m`;
}

function getNightDiffMinutes(startDate, endDate) {
  let nd = 0;
  let cursor = new Date(startDate);
  while (cursor < endDate) {
    const h = cursor.getHours();
    if (h >= 22 || h < 6) nd++;
    cursor = new Date(cursor.getTime() + 60000);
  }
  return nd;
}

function computePunchMetrics(timeIn, timeOut, schedule) {
  const [sh, sm] = schedule.start.split(":").map(Number);
  const [eh, em] = schedule.end.split(":").map(Number);

  const schedStart = new Date(timeIn);
  schedStart.setHours(sh, sm, 0, 0);
  const schedEnd = new Date(timeIn);
  schedEnd.setHours(eh, em, 0, 0);
  if (schedEnd <= schedStart) schedEnd.setDate(schedEnd.getDate() + 1);

  const lateMinutes = Math.max(0, Math.floor((timeIn - schedStart) / 60000));
  const workStart = timeIn > schedStart ? timeIn : schedStart;
  const undertimeMinutes = Math.max(0, Math.floor((schedEnd - timeOut) / 60000));
  const workEnd = timeOut < schedEnd ? timeOut : schedEnd;
  const regularMinutes = Math.max(0, Math.floor((workEnd - workStart) / 60000));
  const otMinutes = Math.max(0, Math.floor((timeOut > schedEnd ? timeOut - schedEnd : 0) / 60000));
  const ndMinutes = getNightDiffMinutes(timeIn, timeOut);
  const totalMinutes = Math.max(0, Math.floor((timeOut - timeIn) / 60000));

  return { regularMinutes, otMinutes, ndMinutes, lateMinutes, undertimeMinutes, totalMinutes };
}

// ─── Routes ──────────────────────────────────────────────────────────────────

/**
 * POST /api/compute-daily
 * Recomputes and saves the daily summary for a given user + date.
 * Body: { userId, date }
 */
app.post("/api/compute-daily", async (req, res) => {
  try {
    const { userId, date } = req.body;
    if (!userId || !date) return res.status(400).json({ error: "userId and date required" });

    const userDoc = await db.doc(`users/${userId}`).get();
    if (!userDoc.exists) return res.status(404).json({ error: "User not found" });

    const schedule = userDoc.data().schedule || { start: "09:00", end: "18:00" };

    const pairsSnap = await db.collection("punchPairs")
      .where("userId", "==", userId)
      .where("date", "==", date)
      .get();

    if (pairsSnap.empty) {
      return res.json({ message: "No punch pairs found", summary: null });
    }

    let totals = {
      regularMinutes: 0, otMinutes: 0, ndMinutes: 0,
      lateMinutes: 0, undertimeMinutes: 0, totalMinutes: 0,
    };

    pairsSnap.forEach((doc) => {
      const d = doc.data();
      const timeIn  = d.timeIn.toDate();
      const timeOut = d.timeOut.toDate();
      const m = computePunchMetrics(timeIn, timeOut, schedule);
      Object.keys(totals).forEach((k) => (totals[k] += m[k]));
    });

    const summaryId = `${userId}_${date}`;
    await db.doc(`dailySummary/${summaryId}`).set({
      userId, date, ...totals,
      punchCount: pairsSnap.size,
      updatedAt: admin.firestore.Timestamp.now(),
    });

    res.json({ message: "Daily summary updated", summary: totals });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/weekly-report/:userId
 * Returns the last 7-day summary for an employee.
 */
app.get("/api/weekly-report/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
    const fromKey = sevenDaysAgo.toISOString().split("T")[0];

    const snap = await db.collection("dailySummary")
      .where("userId", "==", userId)
      .where("date", ">=", fromKey)
      .orderBy("date", "desc")
      .get();

    const summaries = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

    // Compute weekly totals
    const weeklyTotals = summaries.reduce((acc, s) => ({
      regularMinutes: acc.regularMinutes + (s.regularMinutes || 0),
      otMinutes: acc.otMinutes + (s.otMinutes || 0),
      ndMinutes: acc.ndMinutes + (s.ndMinutes || 0),
      lateMinutes: acc.lateMinutes + (s.lateMinutes || 0),
      undertimeMinutes: acc.undertimeMinutes + (s.undertimeMinutes || 0),
      totalMinutes: acc.totalMinutes + (s.totalMinutes || 0),
    }), { regularMinutes: 0, otMinutes: 0, ndMinutes: 0, lateMinutes: 0, undertimeMinutes: 0, totalMinutes: 0 });

    res.json({ userId, summaries, weeklyTotals });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/admin/daily-report?date=YYYY-MM-DD
 * Returns all employees' summary for a given date.
 */
app.get("/api/admin/daily-report", async (req, res) => {
  try {
    const { date } = req.query;
    if (!date) return res.status(400).json({ error: "date query param required" });

    const snap = await db.collection("dailySummary")
      .where("date", "==", date)
      .get();

    const summaries = await Promise.all(snap.docs.map(async (d) => {
      const data = d.data();
      const userDoc = await db.doc(`users/${data.userId}`).get();
      return {
        id: d.id,
        ...data,
        userName: userDoc.exists ? userDoc.data().name : data.userId,
      };
    }));

    res.json({ date, summaries });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/admin/weekly-report
 * Returns last 7-day summary for ALL employees.
 */
app.get("/api/admin/weekly-report", async (req, res) => {
  try {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
    const fromKey = sevenDaysAgo.toISOString().split("T")[0];

    const snap = await db.collection("dailySummary")
      .where("date", ">=", fromKey)
      .orderBy("date", "desc")
      .get();

    const usersSnap = await db.collection("users").get();
    const userMap = {};
    usersSnap.forEach((d) => (userMap[d.id] = d.data().name));

    const summaries = snap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
      userName: userMap[d.data().userId] || d.data().userId,
    }));

    res.json({ from: fromKey, summaries });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`HCM Backend running on port ${PORT}`));
