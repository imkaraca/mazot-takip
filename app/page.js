"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import {
  Home,
  Clock,
  Truck,
  ShieldCheck,
  Fuel,
  ArrowLeft,
  CheckCircle2,
  Plus,
  Lock,
  AlertTriangle,
  Info,
  ChevronRight,
} from "lucide-react";
import { supabase } from "../lib/supabaseClient";

function formatDateTime(iso) {
  const d = new Date(iso);
  return {
    date: d.toLocaleDateString("tr-TR", { day: "2-digit", month: "2-digit", year: "numeric" }),
    time: d.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" }),
  };
}

function computeAverages(vehicles, fillups) {
  return vehicles.map((v) => {
    let rows = fillups.filter((f) => f.vehicleId === v.id).sort((a, b) => a.km - b.km);
    if (v.startKm != null) rows = [{ km: v.startKm, liter: 0 }, ...rows];
    if (rows.length < 2) {
      return { ...v, lastKm: rows[rows.length - 1]?.km ?? v.startKm ?? null, avg: null };
    }
    let totalKm = 0;
    let totalLiter = 0;
    for (let i = 1; i < rows.length; i++) {
      const kmDiff = rows[i].km - rows[i - 1].km;
      if (kmDiff > 0) {
        totalKm += kmDiff;
        totalLiter += rows[i].liter;
      }
    }
    const avg = totalKm > 0 ? (totalLiter / totalKm) * 100 : null;
    return { ...v, lastKm: rows[rows.length - 1].km, avg };
  });
}

function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export default function MazotTakip() {
  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState("home");
  const [screen, setScreen] = useState(null);

  const [employees, setEmployees] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [tankCapacity, setTankCapacity] = useState(3000);
  const [tankLevel, setTankLevel] = useState(0);
  const [fillups, setFillups] = useState([]);
  const [adminPin, setAdminPin] = useState("0000");

  const [currentUser, setCurrentUser] = useState(null);

  const [recordVehicle, setRecordVehicle] = useState(null);
  const [kmInput, setKmInput] = useState("");
  const [literInput, setLiterInput] = useState("");
  const [lastSaved, setLastSaved] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [saving, setSaving] = useState(false);

  const [historyFilter, setHistoryFilter] = useState("today");

  const [pinUnlocked, setPinUnlocked] = useState(false);
  const [pinEntry, setPinEntry] = useState("");
  const [pinError, setPinError] = useState(false);
  const [deliveryInput, setDeliveryInput] = useState("");
  const [newEmployeeName, setNewEmployeeName] = useState("");
  const [newVehiclePlate, setNewVehiclePlate] = useState("");
  const [newVehicleType, setNewVehicleType] = useState("");
  const [newVehicleBrand, setNewVehicleBrand] = useState("");
  const [newVehicleModel, setNewVehicleModel] = useState("");
  const [newVehicleKm, setNewVehicleKm] = useState("");
  const [pinCurrent, setPinCurrent] = useState("");
  const [pinNew, setPinNew] = useState("");
  const [pinConfirm, setPinConfirm] = useState("");
  const [adminToast, setAdminToast] = useState(null);

  const loadAll = useCallback(async () => {
    const [empRes, vehRes, fillRes, settRes] = await Promise.all([
      supabase.from("employees").select("name").order("name"),
      supabase.from("vehicles").select("*"),
      supabase.from("fillups").select("*").order("created_at", { ascending: true }),
      supabase.from("settings").select("*").eq("id", 1).single(),
    ]);
    setEmployees((empRes.data || []).map((e) => e.name));
    setVehicles((vehRes.data || []).map((v) => ({ ...v, startKm: v.start_km })));
    setFillups(
      (fillRes.data || []).map((f) => ({
        id: f.id,
        employee: f.employee,
        vehicleId: f.vehicle_id,
        km: Number(f.km),
        liter: Number(f.liter),
        date: f.created_at,
      }))
    );
    if (settRes.data) {
      setTankLevel(Number(settRes.data.tank_level));
      setTankCapacity(Number(settRes.data.tank_capacity));
      setAdminPin(settRes.data.admin_pin);
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    loadAll();
    const u = typeof window !== "undefined" ? localStorage.getItem("mazot-current-user") : null;
    if (u) setCurrentUser(u);
  }, [loadAll]);

  useEffect(() => {
    if (currentUser && typeof window !== "undefined") localStorage.setItem("mazot-current-user", currentUser);
  }, [currentUser]);

  const vehiclesWithStats = useMemo(() => computeAverages(vehicles, fillups), [vehicles, fillups]);
  const tankPct = tankCapacity > 0 ? Math.max(0, Math.min(100, (tankLevel / tankCapacity) * 100)) : 0;
  const tankState = tankPct < 15 ? "low" : tankPct < 40 ? "mid" : "ok";

  const selectedVehicleObj = vehiclesWithStats.find((v) => v.id === recordVehicle);
  const enteredKm = parseFloat(kmInput);
  const kmTooLow =
    selectedVehicleObj && selectedVehicleObj.lastKm != null && enteredKm && enteredKm < selectedVehicleObj.lastKm;

  function openRecord() {
    setRecordVehicle(null);
    setKmInput("");
    setLiterInput("");
    setErrorMsg("");
    setScreen("record");
  }

  async function handleSave() {
    const liter = parseFloat(literInput);
    if (!recordVehicle) return setErrorMsg("Lütfen araç seçin.");
    if (!enteredKm || enteredKm <= 0 || !liter || liter <= 0)
      return setErrorMsg("Kilometre ve litre bilgisini girin.");
    if (kmTooLow) return setErrorMsg("Kilometre önceki kayıttan düşük olamaz.");
    if (liter > tankLevel) return setErrorMsg("Depoda bu kadar mazot yok, yöneticiye bildirin.");

    setSaving(true);
    const { error } = await supabase
      .from("fillups")
      .insert({ employee: currentUser, vehicle_id: recordVehicle, km: enteredKm, liter });
    if (error) {
      setSaving(false);
      return setErrorMsg("Kayıt sırasında bir hata oluştu, tekrar deneyin.");
    }
    const newLevel = Math.max(0, tankLevel - liter);
    await supabase.from("settings").update({ tank_level: newLevel }).eq("id", 1);
    setLastSaved({
      employee: currentUser,
      km: enteredKm,
      liter,
      date: new Date().toISOString(),
      vehicle: selectedVehicleObj,
    });
    await loadAll();
    setSaving(false);
    setScreen("success");
  }

  function handlePinSubmit() {
    if (pinEntry === adminPin) {
      setPinUnlocked(true);
      setPinEntry("");
      setPinError(false);
    } else setPinError(true);
  }

  function showAdminToast(text, kind = "ok") {
    setAdminToast({ text, kind });
    setTimeout(() => setAdminToast(null), 2600);
  }

  async function handleAddDelivery() {
    const liter = parseFloat(deliveryInput);
    if (!liter || liter <= 0) return showAdminToast("Geçerli bir litre girin.", "warn");
    const newLevel = Math.min(tankCapacity, tankLevel + liter);
    await supabase.from("settings").update({ tank_level: newLevel }).eq("id", 1);
    setDeliveryInput("");
    await loadAll();
    showAdminToast(`${liter} L depoya eklendi.`, "ok");
  }

  async function handleChangePin() {
    if (pinCurrent !== adminPin) return showAdminToast("Mevcut PIN hatalı.", "warn");
    if (!pinNew || pinNew.length < 4) return showAdminToast("Yeni PIN en az 4 hane olsun.", "warn");
    if (pinNew !== pinConfirm) return showAdminToast("Yeni PIN'ler eşleşmiyor.", "warn");
    await supabase.from("settings").update({ admin_pin: pinNew }).eq("id", 1);
    setPinCurrent("");
    setPinNew("");
    setPinConfirm("");
    await loadAll();
    showAdminToast("PIN güncellendi.", "ok");
  }

  async function handleAddEmployee() {
    const name = newEmployeeName.trim();
    if (!name) return showAdminToast("Şoför adı girin.", "warn");
    if (employees.includes(name)) return showAdminToast("Bu isim zaten listede.", "warn");
    const { error } = await supabase.from("employees").insert({ name });
    if (error) return showAdminToast("Eklenemedi, tekrar deneyin.", "warn");
    setNewEmployeeName("");
    await loadAll();
    showAdminToast("Şoför eklendi.", "ok");
  }

  async function handleAddVehicle() {
    const plate = newVehiclePlate.trim();
    const km = parseFloat(newVehicleKm);
    if (!plate) return showAdminToast("Plaka girin.", "warn");
    if (!newVehicleKm || isNaN(km) || km < 0) return showAdminToast("Geçerli bir başlangıç km'si girin.", "warn");
    const { error } = await supabase.from("vehicles").insert({
      plate,
      type: newVehicleType.trim() || "Araç",
      brand: newVehicleBrand.trim(),
      model: newVehicleModel.trim(),
      start_km: km,
    });
    if (error) return showAdminToast("Eklenemedi, tekrar deneyin.", "warn");
    setNewVehiclePlate("");
    setNewVehicleType("");
    setNewVehicleBrand("");
    setNewVehicleModel("");
    setNewVehicleKm("");
    await loadAll();
    showAdminToast("Araç eklendi.", "ok");
  }

  const filteredHistory = useMemo(() => {
    const now = new Date();
    return [...fillups]
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .filter((f) => {
        const d = new Date(f.date);
        if (historyFilter === "today") return isSameDay(d, now);
        if (historyFilter === "week") return (now - d) / (1000 * 60 * 60 * 24) <= 7;
        if (historyFilter === "month") return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
        return true;
      });
  }, [fillups, historyFilter]);

  const todayTotal = useMemo(() => {
    const now = new Date();
    return fillups.filter((f) => isSameDay(new Date(f.date), now)).reduce((s, f) => s + f.liter, 0);
  }, [fillups]);

  if (!loaded) {
    return (
      <div style={{ padding: 40, textAlign: "center", fontFamily: "Inter, sans-serif", color: "#64748b" }}>
        Yükleniyor...
      </div>
    );
  }

  return (
    <div className="mz-app">
      <style>{`
        .mz-app {
          --primary: #d6293a;
          --primary-dark: #a81f2c;
          --bg: #f1f5f9;
          --surface: #ffffff;
          --border: #e2e8f0;
          --text: #0f172a;
          --text-muted: #64748b;
          --success-bg: #dcfce7;
          --success-text: #166534;
          --warn-bg: #fef3c7;
          --warn-text: #92400e;
          --info-bg: #eff6ff;
          --info-text: #1d4ed8;
          --green: #16a34a;
          --amber: #d97706;
          --red: #dc2626;
          font-family: "Inter", system-ui, sans-serif;
          background: var(--bg);
          color: var(--text);
          max-width: 420px;
          margin: 0 auto;
          min-height: 100vh;
        }
        .mz-app * { box-sizing: border-box; }
        .mz-header {
          background: linear-gradient(135deg, var(--primary), var(--primary-dark));
          color: white;
          padding: 24px 18px 20px;
          border-radius: 0 0 22px 22px;
        }
        .mz-header-top { display: flex; align-items: center; gap: 10px; }
        .mz-back { background: rgba(255,255,255,0.15); border: none; color: white; width: 32px; height: 32px; border-radius: 9px; display: flex; align-items: center; justify-content: center; cursor: pointer; }
        .mz-header-title { font-size: 17px; font-weight: 700; }
        .mz-header-sub { font-size: 12px; opacity: 0.85; margin-top: 3px; letter-spacing: 0.3px; }
        .mz-greeting { font-size: 20px; font-weight: 800; margin-top: 4px; }
        .mz-content { padding: 16px; padding-bottom: 90px; min-height: 480px; }
        .mz-card { background: var(--surface); border: 1px solid var(--border); border-radius: 16px; padding: 16px; box-shadow: 0 2px 10px rgba(15,23,42,0.04); }
        .mz-card + .mz-card { margin-top: 12px; }
        .mz-section-title { font-size: 12px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.4px; margin: 18px 0 8px; }
        .mz-big-btn {
          width: 100%; display: flex; align-items: center; gap: 12px;
          background: linear-gradient(135deg, var(--primary), var(--primary-dark));
          color: white; border: none; border-radius: 16px; padding: 16px 18px;
          font-size: 15px; font-weight: 700; cursor: pointer; margin-top: 4px;
        }
        .mz-icon-circle { width: 38px; height: 38px; border-radius: 12px; background: rgba(255,255,255,0.2); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
        .mz-btn-arrow { margin-left: auto; opacity: 0.8; }
        .mz-grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 12px; }
        .mz-mini-card { background: var(--surface); border: 1px solid var(--border); border-radius: 14px; padding: 14px; cursor: pointer; text-align: left; }
        .mz-mini-card .mz-icon-circle { background: #fee2e2; color: var(--primary); margin-bottom: 8px; }
        .mz-mini-card-label { font-size: 13px; font-weight: 600; }
        .mz-gauge-top { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 8px; }
        .mz-gauge-label { font-size: 12px; color: var(--text-muted); font-weight: 600; }
        .mz-gauge-value { font-size: 18px; font-weight: 800; }
        .mz-gauge-track { height: 12px; background: #f1f5f9; border-radius: 7px; overflow: hidden; border: 1px solid var(--border); }
        .mz-gauge-fill { height: 100%; border-radius: 7px; }
        .mz-gauge-fill.ok { background: var(--green); }
        .mz-gauge-fill.mid { background: var(--amber); }
        .mz-gauge-fill.low { background: var(--red); }
        .mz-chip-row { display: flex; flex-wrap: wrap; gap: 8px; }
        .mz-chip { background: var(--surface); border: 1px solid var(--border); color: var(--text); border-radius: 10px; padding: 11px 14px; font-size: 14px; font-weight: 600; cursor: pointer; flex: 1 1 auto; min-width: 100px; text-align: center; }
        .mz-chip.selected { background: var(--primary); border-color: var(--primary); color: white; }
        .mz-filter-chip { border: 1px solid var(--border); background: var(--surface); color: var(--text-muted); font-size: 12px; font-weight: 700; padding: 7px 12px; border-radius: 20px; cursor: pointer; }
        .mz-filter-chip.active { background: var(--primary); border-color: var(--primary); color: white; }
        .mz-field { margin-top: 14px; }
        .mz-field label { display: block; font-size: 12px; font-weight: 700; color: var(--text); margin-bottom: 6px; }
        .mz-field select, .mz-field input {
          width: 100%; height: 50px; border: 1px solid var(--border); border-radius: 12px;
          padding: 0 14px; font-size: 16px; background: var(--surface); color: var(--text); font-family: "Inter", sans-serif;
        }
        .mz-field select:focus, .mz-field input:focus { outline: none; border-color: var(--primary); }
        .mz-warn-box { display: flex; gap: 10px; margin-top: 12px; padding: 13px; border-radius: 12px; background: var(--warn-bg); color: var(--warn-text); font-size: 13px; line-height: 1.5; }
        .mz-info-box { display: flex; gap: 10px; margin-top: 12px; padding: 13px; border-radius: 12px; background: var(--info-bg); color: var(--info-text); font-size: 13px; line-height: 1.5; }
        .mz-error-box { margin-top: 12px; padding: 12px; border-radius: 12px; background: #fee2e2; color: #b91c1c; font-size: 13px; font-weight: 600; }
        .mz-save-btn { width: 100%; height: 54px; margin-top: 20px; border: none; border-radius: 14px; background: var(--green); color: white; font-size: 15px; font-weight: 800; cursor: pointer; }
        .mz-save-btn:disabled { opacity: 0.6; cursor: default; }
        .mz-save-btn.secondary { background: var(--primary); }
        .mz-success-wrap { text-align: center; padding: 20px 0 6px; }
        .mz-success-icon { color: var(--success-text); margin-bottom: 10px; }
        .mz-success-title { font-size: 18px; font-weight: 800; color: var(--success-text); }
        .mz-detail-row { display: flex; align-items: center; gap: 12px; padding: 11px 0; border-bottom: 1px solid var(--border); }
        .mz-detail-row:last-child { border-bottom: none; }
        .mz-detail-icon { width: 34px; height: 34px; border-radius: 10px; background: #fee2e2; color: var(--primary); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
        .mz-detail-label { font-size: 11px; color: var(--text-muted); font-weight: 600; }
        .mz-detail-value { font-size: 14px; font-weight: 700; }
        .mz-history-item { display: flex; gap: 12px; padding: 12px 0; border-bottom: 1px solid var(--border); }
        .mz-history-item:last-child { border-bottom: none; }
        .mz-history-icon { width: 40px; height: 40px; border-radius: 12px; background: #fee2e2; color: var(--primary); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
        .mz-history-name { font-size: 14px; font-weight: 700; }
        .mz-history-sub { font-size: 12px; color: var(--text-muted); margin-top: 2px; }
        .mz-history-right { margin-left: auto; text-align: right; }
        .mz-history-liter { font-size: 14px; font-weight: 800; color: var(--primary); }
        .mz-history-time { font-size: 11px; color: var(--text-muted); }
        .mz-nav { position: fixed; bottom: 0; left: 50%; transform: translateX(-50%); width: 100%; max-width: 420px; background: var(--surface); border-top: 1px solid var(--border); display: flex; padding: 8px 4px; }
        .mz-nav button { flex: 1; background: none; border: none; display: flex; flex-direction: column; align-items: center; gap: 3px; padding: 6px 0; cursor: pointer; color: var(--text-muted); font-size: 10px; font-weight: 700; }
        .mz-nav button.active { color: var(--primary); }
        .mz-vehicle-row { display: flex; align-items: center; gap: 12px; padding: 12px 0; border-bottom: 1px solid var(--border); }
        .mz-vehicle-row:last-child { border-bottom: none; }
        .mz-vehicle-icon { width: 42px; height: 42px; border-radius: 12px; background: #fee2e2; color: var(--primary); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
        .mz-vehicle-plate { font-size: 14px; font-weight: 800; }
        .mz-vehicle-sub { font-size: 12px; color: var(--text-muted); margin-top: 2px; }
        .mz-vehicle-avg { margin-left: auto; text-align: right; font-size: 12px; font-weight: 700; color: var(--text-muted); }
        .mz-lock-screen { text-align: center; padding: 30px 10px; }
        .mz-lock-icon { width: 60px; height: 60px; border-radius: 18px; background: #fee2e2; color: var(--primary); display: flex; align-items: center; justify-content: center; margin: 0 auto 16px; }
        .mz-toast { margin-top: 14px; padding: 11px 14px; border-radius: 12px; font-size: 13px; font-weight: 700; }
        .mz-toast.ok { background: var(--success-bg); color: var(--success-text); }
        .mz-toast.warn { background: #fee2e2; color: #b91c1c; }
        .mz-empty { text-align: center; padding: 30px 10px; color: var(--text-muted); font-size: 13px; }
      `}</style>

      {screen === "record" && (
        <>
          <div className="mz-header">
            <div className="mz-header-top">
              <button className="mz-back" onClick={() => setScreen(null)}>
                <ArrowLeft size={18} />
              </button>
              <div className="mz-header-title">Mazot Kaydı</div>
            </div>
          </div>
          <div className="mz-content">
            <div className="mz-card">
              <div className="mz-field" style={{ marginTop: 0 }}>
                <label>Şoför</label>
                <select value={currentUser || ""} onChange={(e) => setCurrentUser(e.target.value)}>
                  <option value="" disabled>
                    Seçin
                  </option>
                  {employees.map((e) => (
                    <option key={e} value={e}>
                      {e}
                    </option>
                  ))}
                </select>
              </div>

              <div className="mz-field">
                <label>Araç / Plaka</label>
                <select value={recordVehicle || ""} onChange={(e) => setRecordVehicle(e.target.value)}>
                  <option value="" disabled>
                    Seçin
                  </option>
                  {vehicles.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.plate} — {v.type}
                    </option>
                  ))}
                </select>
              </div>

              <div className="mz-field">
                <label>Kilometre</label>
                <input
                  type="number"
                  inputMode="numeric"
                  placeholder="Örn. 128720"
                  value={kmInput}
                  onChange={(e) => setKmInput(e.target.value)}
                />
              </div>

              {kmTooLow && (
                <div className="mz-warn-box">
                  <AlertTriangle size={18} style={{ flexShrink: 0 }} />
                  <div>
                    <strong>Kilometreyi kontrol edin.</strong>
                    <br />
                    Bu aracın son kilometresi: {selectedVehicleObj.lastKm.toLocaleString("tr-TR")} km
                    <br />
                    Girdiğiniz kilometre: {enteredKm.toLocaleString("tr-TR")} km
                  </div>
                </div>
              )}

              {!kmTooLow && selectedVehicleObj && selectedVehicleObj.lastKm != null && (
                <div className="mz-info-box">
                  <Info size={18} style={{ flexShrink: 0 }} />
                  <div>Son kayıt: {selectedVehicleObj.lastKm.toLocaleString("tr-TR")} km</div>
                </div>
              )}

              <div className="mz-field">
                <label>Alınan Mazot (Litre)</label>
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.1"
                  placeholder="Örn. 85"
                  value={literInput}
                  onChange={(e) => setLiterInput(e.target.value)}
                />
              </div>

              {errorMsg && <div className="mz-error-box">{errorMsg}</div>}

              <button className="mz-save-btn" onClick={handleSave} disabled={saving}>
                {saving ? "Kaydediliyor..." : "✓ Kaydet"}
              </button>
            </div>
          </div>
        </>
      )}

      {screen === "success" && lastSaved && (
        <>
          <div className="mz-header">
            <div className="mz-header-top">
              <button className="mz-back" onClick={() => setScreen(null)}>
                <ArrowLeft size={18} />
              </button>
              <div className="mz-header-title">Mazot Kaydı</div>
            </div>
          </div>
          <div className="mz-content">
            <div className="mz-card">
              <div className="mz-success-wrap">
                <CheckCircle2 size={54} className="mz-success-icon" />
                <div className="mz-success-title">Kayıt Başarıyla Oluşturuldu</div>
              </div>
              <div style={{ marginTop: 10 }}>
                <div className="mz-detail-row">
                  <div className="mz-detail-icon">
                    <Clock size={16} />
                  </div>
                  <div>
                    <div className="mz-detail-label">TARİH &amp; SAAT</div>
                    <div className="mz-detail-value">
                      {formatDateTime(lastSaved.date).date} {formatDateTime(lastSaved.date).time}
                    </div>
                  </div>
                </div>
                <div className="mz-detail-row">
                  <div className="mz-detail-icon">
                    <ShieldCheck size={16} />
                  </div>
                  <div>
                    <div className="mz-detail-label">ŞOFÖR</div>
                    <div className="mz-detail-value">{lastSaved.employee}</div>
                  </div>
                </div>
                <div className="mz-detail-row">
                  <div className="mz-detail-icon">
                    <Truck size={16} />
                  </div>
                  <div>
                    <div className="mz-detail-label">ARAÇ / PLAKA</div>
                    <div className="mz-detail-value">
                      {lastSaved.vehicle?.plate} — {lastSaved.vehicle?.type}
                    </div>
                  </div>
                </div>
                <div className="mz-detail-row">
                  <div className="mz-detail-icon">
                    <Fuel size={16} />
                  </div>
                  <div>
                    <div className="mz-detail-label">KİLOMETRE / ALINAN MAZOT</div>
                    <div className="mz-detail-value">
                      {lastSaved.km.toLocaleString("tr-TR")} km · {lastSaved.liter} L
                    </div>
                  </div>
                </div>
              </div>
              <button
                className="mz-save-btn secondary"
                onClick={() => {
                  setScreen(null);
                  setTab("home");
                }}
              >
                Tamam
              </button>
            </div>
          </div>
        </>
      )}

      {!screen && (
        <>
          <div className="mz-header">
            <div className="mz-header-sub">ŞİRKET MAZOT TAKİP</div>
            <div className="mz-greeting">
              {tab === "home" && (currentUser ? `Merhaba ${currentUser.split(" ")[0]} 👋` : "Merhaba 👋")}
              {tab === "history" && "Son Kayıtlar"}
              {tab === "vehicles" && "Araçlar"}
              {tab === "admin" && "Yönetici Paneli"}
            </div>
          </div>

          <div className="mz-content">
            {tab === "home" && (
              <div>
                {!currentUser && (
                  <div className="mz-card">
                    <div className="mz-section-title" style={{ margin: "0 0 8px" }}>
                      Kim olarak devam ediyorsunuz?
                    </div>
                    <div className="mz-chip-row">
                      {employees.map((e) => (
                        <button key={e} className="mz-chip" onClick={() => setCurrentUser(e)}>
                          {e}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {currentUser && (
                  <>
                    <button className="mz-big-btn" onClick={openRecord}>
                      <span className="mz-icon-circle">
                        <Fuel size={19} />
                      </span>
                      Mazot Kaydı Oluştur
                      <ChevronRight size={18} className="mz-btn-arrow" />
                    </button>

                    <div className="mz-grid2">
                      <button className="mz-mini-card" onClick={() => setTab("history")}>
                        <span className="mz-icon-circle">
                          <Clock size={17} />
                        </span>
                        <div className="mz-mini-card-label">Son Kayıtlar</div>
                      </button>
                      <button className="mz-mini-card" onClick={() => setTab("vehicles")}>
                        <span className="mz-icon-circle">
                          <Truck size={17} />
                        </span>
                        <div className="mz-mini-card-label">Araçlarım</div>
                      </button>
                    </div>

                    <div className="mz-card" style={{ marginTop: 12 }}>
                      <div className="mz-gauge-top">
                        <span className="mz-gauge-label">DEPO DURUMU</span>
                        <span className="mz-gauge-value">
                          {Math.round(tankLevel).toLocaleString("tr-TR")} / {tankCapacity.toLocaleString("tr-TR")} L
                        </span>
                      </div>
                      <div className="mz-gauge-track">
                        <div className={`mz-gauge-fill ${tankState}`} style={{ width: `${tankPct}%` }} />
                      </div>
                    </div>

                    <button
                      className="mz-chip"
                      style={{ marginTop: 12, width: "100%" }}
                      onClick={() => setCurrentUser(null)}
                    >
                      Kullanıcı değiştir
                    </button>
                  </>
                )}
              </div>
            )}

            {tab === "history" && (
              <div>
                <div className="mz-chip-row" style={{ marginBottom: 4 }}>
                  {[
                    ["today", "Bugün"],
                    ["week", "Bu Hafta"],
                    ["month", "Bu Ay"],
                    ["all", "Tümü"],
                  ].map(([key, label]) => (
                    <button
                      key={key}
                      className={`mz-filter-chip ${historyFilter === key ? "active" : ""}`}
                      onClick={() => setHistoryFilter(key)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <div className="mz-card" style={{ marginTop: 12 }}>
                  {filteredHistory.length === 0 && <div className="mz-empty">Bu aralıkta kayıt yok.</div>}
                  {filteredHistory.map((f) => {
                    const v = vehicles.find((x) => x.id === f.vehicleId);
                    const dt = formatDateTime(f.date);
                    return (
                      <div className="mz-history-item" key={f.id}>
                        <div className="mz-history-icon">
                          <Truck size={18} />
                        </div>
                        <div>
                          <div className="mz-history-name">{f.employee}</div>
                          <div className="mz-history-sub">
                            {v?.plate} · {v?.type} · {f.km.toLocaleString("tr-TR")} km
                          </div>
                        </div>
                        <div className="mz-history-right">
                          <div className="mz-history-liter">{f.liter} L</div>
                          <div className="mz-history-time">{dt.time}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {tab === "vehicles" && (
              <div>
                <div className="mz-card">
                  {vehiclesWithStats.map((v) => (
                    <div className="mz-vehicle-row" key={v.id}>
                      <div className="mz-vehicle-icon">
                        <Truck size={19} />
                      </div>
                      <div>
                        <div className="mz-vehicle-plate">{v.plate}</div>
                        <div className="mz-vehicle-sub">
                          {v.type}
                          {v.brand ? ` · ${v.brand} ${v.model || ""}` : ""}
                          {v.lastKm != null ? ` · Son KM: ${v.lastKm.toLocaleString("tr-TR")}` : ""}
                        </div>
                      </div>
                      <div className="mz-vehicle-avg">{v.avg != null ? `${v.avg.toFixed(1)} L/100km` : "—"}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {tab === "admin" && !pinUnlocked && (
              <div className="mz-card mz-lock-screen">
                <div className="mz-lock-icon">
                  <Lock size={26} />
                </div>
                <div style={{ fontWeight: 700, marginBottom: 14 }}>Devam etmek için PIN girin</div>
                <div className="mz-field" style={{ marginTop: 0 }}>
                  <input
                    type="password"
                    inputMode="numeric"
                    placeholder="PIN"
                    value={pinEntry}
                    onChange={(e) => {
                      setPinEntry(e.target.value);
                      setPinError(false);
                    }}
                  />
                </div>
                <button className="mz-save-btn secondary" onClick={handlePinSubmit}>
                  Giriş Yap
                </button>
                {pinError && <div className="mz-toast warn">Hatalı PIN.</div>}
              </div>
            )}

            {tab === "admin" && pinUnlocked && (
              <div>
                <div className="mz-card">
                  <div className="mz-gauge-top">
                    <span className="mz-gauge-label">DEPO DURUMU</span>
                    <span className="mz-gauge-value">
                      {Math.round(tankLevel).toLocaleString("tr-TR")} / {tankCapacity.toLocaleString("tr-TR")} L
                    </span>
                  </div>
                  <div className="mz-gauge-track">
                    <div className={`mz-gauge-fill ${tankState}`} style={{ width: `${tankPct}%` }} />
                  </div>
                  <div className="mz-field" style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
                    <div style={{ flex: 1 }}>
                      <label>Depoya mazot geldi (L)</label>
                      <input
                        type="number"
                        inputMode="decimal"
                        value={deliveryInput}
                        onChange={(e) => setDeliveryInput(e.target.value)}
                      />
                    </div>
                    <button
                      className="mz-save-btn secondary"
                      style={{ marginTop: 0, width: "auto", padding: "0 18px", height: 50 }}
                      onClick={handleAddDelivery}
                    >
                      Ekle
                    </button>
                  </div>
                  <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 8 }}>
                    Bugün toplam: {todayTotal} L
                  </div>
                </div>

                <div className="mz-section-title">Yeni Şoför Ekle</div>
                <div className="mz-card">
                  <div className="mz-field" style={{ marginTop: 0 }}>
                    <input
                      type="text"
                      placeholder="Ad Soyad"
                      value={newEmployeeName}
                      onChange={(e) => setNewEmployeeName(e.target.value)}
                    />
                  </div>
                  <button className="mz-save-btn secondary" onClick={handleAddEmployee}>
                    <Plus size={16} style={{ verticalAlign: -3 }} /> Şoför Ekle
                  </button>
                </div>

                <div className="mz-section-title">Yeni Araç Ekle</div>
                <div className="mz-card">
                  <div className="mz-field" style={{ marginTop: 0 }}>
                    <label>Plaka</label>
                    <input
                      type="text"
                      placeholder="Örn. 34 JKL 321"
                      value={newVehiclePlate}
                      onChange={(e) => setNewVehiclePlate(e.target.value)}
                    />
                  </div>
                  <div className="mz-field">
                    <label>Tür</label>
                    <input
                      type="text"
                      placeholder="Mikser, Damper, Kepçe..."
                      value={newVehicleType}
                      onChange={(e) => setNewVehicleType(e.target.value)}
                    />
                  </div>
                  <div className="mz-field">
                    <label>Marka</label>
                    <input type="text" value={newVehicleBrand} onChange={(e) => setNewVehicleBrand(e.target.value)} />
                  </div>
                  <div className="mz-field">
                    <label>Model</label>
                    <input type="text" value={newVehicleModel} onChange={(e) => setNewVehicleModel(e.target.value)} />
                  </div>
                  <div className="mz-field">
                    <label>Başlangıç Km</label>
                    <input
                      type="number"
                      inputMode="numeric"
                      value={newVehicleKm}
                      onChange={(e) => setNewVehicleKm(e.target.value)}
                    />
                  </div>
                  <button className="mz-save-btn secondary" onClick={handleAddVehicle}>
                    <Plus size={16} style={{ verticalAlign: -3 }} /> Araç Ekle
                  </button>
                </div>

                <div className="mz-section-title">PIN Değiştir</div>
                <div className="mz-card">
                  <div className="mz-field" style={{ marginTop: 0 }}>
                    <label>Mevcut PIN</label>
                    <input type="password" inputMode="numeric" value={pinCurrent} onChange={(e) => setPinCurrent(e.target.value)} />
                  </div>
                  <div className="mz-field">
                    <label>Yeni PIN</label>
                    <input type="password" inputMode="numeric" value={pinNew} onChange={(e) => setPinNew(e.target.value)} />
                  </div>
                  <div className="mz-field">
                    <label>Yeni PIN (tekrar)</label>
                    <input type="password" inputMode="numeric" value={pinConfirm} onChange={(e) => setPinConfirm(e.target.value)} />
                  </div>
                  <button className="mz-save-btn secondary" onClick={handleChangePin}>
                    PIN'i Güncelle
                  </button>
                </div>

                {adminToast && <div className={`mz-toast ${adminToast.kind}`}>{adminToast.text}</div>}
              </div>
            )}
          </div>

          <div className="mz-nav">
            <button className={tab === "home" ? "active" : ""} onClick={() => setTab("home")}>
              <Home size={20} />
              Ana Sayfa
            </button>
            <button className={tab === "history" ? "active" : ""} onClick={() => setTab("history")}>
              <Clock size={20} />
              Kayıtlar
            </button>
            <button className={tab === "vehicles" ? "active" : ""} onClick={() => setTab("vehicles")}>
              <Truck size={20} />
              Araçlar
            </button>
            <button className={tab === "admin" ? "active" : ""} onClick={() => setTab("admin")}>
              <ShieldCheck size={20} />
              Yönetici
            </button>
          </div>
        </>
      )}
    </div>
  );
}

