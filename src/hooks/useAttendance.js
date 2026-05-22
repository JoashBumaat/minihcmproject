// src/hooks/useAttendance.js
import { useState, useEffect } from "react";
import {
  collection,
  addDoc,
  query,
  where,
  onSnapshot,
  doc,
  setDoc,
  getDocs,
  Timestamp,
} from "firebase/firestore";
import { db } from "../firebase";
import { computePunchMetrics, aggregateMetrics, getDateKey } from "../utils/hcmCompute";

// ─── Today's Punch Log ────────────────────────────────────────────────────────
export function useAttendance(userId, schedule) {
  const [todayPunches, setTodayPunches] = useState([]);
  const [activePunch,  setActivePunch]  = useState(null);
  const [loading,      setLoading]      = useState(true);
  const [punchError,   setPunchError]   = useState("");

  const todayKey = getDateKey(new Date());

  useEffect(() => {
    if (!userId) return;

    const q = query(
      collection(db, "attendance"),
      where("userId", "==", userId),
      where("date",   "==", todayKey)
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        const items = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .sort((a, b) => a.timestamp.seconds - b.timestamp.seconds);
        setTodayPunches(items);
        const last = items[items.length - 1];
        setActivePunch(last?.type === "in" ? last : null);
        setLoading(false);
        setPunchError("");
      },
      (err) => {
        console.error("Attendance listener error:", err);
        setPunchError(err.message);
        setLoading(false);
      }
    );
    return unsub;
  }, [userId, todayKey]);

  // ── Punch In ────────────────────────────────────────────────────────────────
  async function punchIn() {
    setPunchError("");
    const now = new Date();
    try {
      await addDoc(collection(db, "attendance"), {
        userId,                          // user ID included
        type:      "in",
        timestamp: Timestamp.fromDate(now), // timestamp included
        date:      getDateKey(now),
        timeLabel: now.toLocaleTimeString("en-PH", {
          hour: "2-digit", minute: "2-digit", second: "2-digit"
        }),
      });
    } catch (err) {
      setPunchError("Punch In failed: " + err.message);
      throw err;
    }
  }

  // ── Punch Out ───────────────────────────────────────────────────────────────
  async function punchOut() {
    if (!activePunch) return;
    setPunchError("");
    const now    = new Date();
    const timeIn = activePunch.timestamp.toDate();

    try {
      // 1. Save OUT record with userId + timestamp
      await addDoc(collection(db, "attendance"), {
        userId,                             // user ID included
        type:        "out",
        timestamp:   Timestamp.fromDate(now),  // timestamp included
        date:        getDateKey(now),
        pairedWith:  activePunch.id,
        timeLabel:   now.toLocaleTimeString("en-PH", {
          hour: "2-digit", minute: "2-digit", second: "2-digit"
        }),
      });

      // 2. Compute metrics
      const metrics = computePunchMetrics(timeIn, now, schedule);

      // 3. Save punch pair record
      await addDoc(collection(db, "punchPairs"), {
        userId,
        date:      getDateKey(now),
        timeIn:    Timestamp.fromDate(timeIn),
        timeOut:   Timestamp.fromDate(now),
        ...metrics,
        createdAt: Timestamp.fromDate(now),
      });

      // 4. Update daily summary
      await updateDailySummary(userId, getDateKey(now), schedule);

    } catch (err) {
      setPunchError("Punch Out failed: " + err.message);
      throw err;
    }
  }

  return { todayPunches, activePunch, loading, punchIn, punchOut, punchError };
}

// ─── Recompute Daily Summary ─────────────────────────────────────────────────
export async function updateDailySummary(userId, dateKey, schedule) {
  const q = query(
    collection(db, "punchPairs"),
    where("userId", "==", userId),
    where("date",   "==", dateKey)
  );
  const snap     = await getDocs(q);
  const allPairs = snap.docs.map((d) => d.data());
  if (allPairs.length === 0) return;

  const agg       = aggregateMetrics(allPairs);
  const summaryId = `${userId}_${dateKey}`;

  await setDoc(doc(db, "dailySummary", summaryId), {
    userId,
    date: dateKey,
    ...agg,
    punchCount: allPairs.length,
    updatedAt:  Timestamp.fromDate(new Date()),
  });
}

// ─── Weekly Summary for Employee Dashboard ───────────────────────────────────
export function useWeeklySummary(userId) {
  const [summaries, setSummaries] = useState([]);
  const [loading,   setLoading]   = useState(true);

  useEffect(() => {
    if (!userId) return;

    const q = query(
      collection(db, "dailySummary"),
      where("userId", "==", userId)
    );

    const unsub = onSnapshot(q, (snap) => {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
      const fromKey = getDateKey(sevenDaysAgo);

      const filtered = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((s) => s.date >= fromKey)
        .sort((a, b) => b.date.localeCompare(a.date));

      setSummaries(filtered);
      setLoading(false);
    });

    return unsub;
  }, [userId]);

  return { summaries, loading };
}

// ─── All Employees Summaries for a Date Range (Admin) ────────────────────────
export function useAdminWeeklySummaries(weekOffset) {
  const [summaries, setSummaries] = useState([]);
  const [loading,   setLoading]   = useState(true);

  useEffect(() => {
    // Anchor to Monday–Friday of the target week
    const today = new Date();
    // Find this week's Monday (weekOffset=0), last week's Monday (weekOffset=-1), etc.
    const dayOfWeek = today.getDay(); // 0=Sun,1=Mon,...,6=Sat
    const daysToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek; // shift to Monday
    const monday = new Date(today);
    monday.setDate(today.getDate() + daysToMonday + weekOffset * 7);
    monday.setHours(0, 0, 0, 0);

    const friday = new Date(monday);
    friday.setDate(monday.getDate() + 4); // Mon+4 = Fri

    // Cap end date to today so future dates are not shown
    const endDate = friday > today ? new Date(today) : friday;

    const fromKey = getDateKey(monday);
    const toKey   = getDateKey(endDate);

    const unsub = onSnapshot(query(collection(db, "dailySummary")), (snap) => {
      const filtered = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((s) => s.date >= fromKey && s.date <= toKey)
        .sort((a, b) => b.date.localeCompare(a.date));
      setSummaries(filtered);
      setLoading(false);
    });

    return unsub;
  }, [weekOffset]);

  return { summaries, loading };
}

// ─── All Employees for a Date (Admin daily) ───────────────────────────────────
export function useAllEmployeeSummaries(dateKey) {
  const [summaries, setSummaries] = useState([]);
  const [loading,   setLoading]   = useState(true);

  useEffect(() => {
    if (!dateKey) return;
    const q = query(
      collection(db, "dailySummary"),
      where("date", "==", dateKey)
    );
    const unsub = onSnapshot(q, (snap) => {
      setSummaries(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
    return unsub;
  }, [dateKey]);

  return { summaries, loading };
}
