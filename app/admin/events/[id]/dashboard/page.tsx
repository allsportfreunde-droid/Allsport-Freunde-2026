"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
import { flushSync } from "react-dom";
import { useParams, useRouter } from "next/navigation";
import {
  CheckCircle2,
  Clock,
  Users,
  Search,
  QrCode,
  Download,
  RefreshCw,
  UserCheck,
  Undo2,
  UserPlus,
  X,
  Copy,
  ExternalLink,
  Check,
  Heart,
  Trash2,
  MoreHorizontal,
  Plus,
  List,
  BadgeCheck,
  AlertTriangle,
  Banknote,
  Euro,
  Hourglass,
  Mail,
  ChevronDown,
  Smartphone,
  PenLine,
} from "lucide-react";
import ChildBadge from "@/components/ChildBadge";
import PaidBadge from "@/components/PaidBadge";
import RegistrationDetailButton from "@/components/RegistrationDetailButton";
import { LastNameInput } from "@/components/ui/LastNameInput";
import type {
  CheckinParticipant,
  CheckinStatusResponse,
  EventFinancials,
  EventDonation,
  WaitlistEntry,
} from "@/lib/types";
import { formatEuro } from "@/lib/finance";

function formatTime(iso: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
}

interface WalkInPerson {
  firstName: string;
  lastName: string;
}

interface WalkInForm {
  persons: WalkInPerson[];
  email: string;
  phone: string;
  notes: string;
  /** Schickt die Mail mit Betrag und Zahlungslink. Standard: an. */
  sendEmail: boolean;
}

interface DonationForm {
  registration_id: number | null;
  donor_name: string;
  amount: string;
  note: string;
}

const EMPTY_DONATION: DonationForm = {
  registration_id: null,
  donor_name: "",
  amount: "",
  note: "",
};

const EMPTY_FORM: WalkInForm = {
  persons: [{ firstName: "", lastName: "" }],
  email: "",
  phone: "",
  notes: "",
  sendEmail: true,
};

export default function CheckinDashboardPage() {
  const { id: eventId } = useParams<{ id: string }>();
  const router = useRouter();

  const [data, setData] = useState<CheckinStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [manualCheckinId, setManualCheckinId] = useState<number | null>(null);
  const [undoId, setUndoId] = useState<number | null>(null);
  const [personLoadingId, setPersonLoadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [financials, setFinancials] = useState<EventFinancials | null>(null);

  // Kassenabschluss state
  const [cashInput, setCashInput] = useState("");
  const [cashSaving, setCashSaving] = useState(false);
  const [cashError, setCashError] = useState<string | null>(null);

  // Walk-in modal state
  const [showWalkIn, setShowWalkIn] = useState(false);
  const [walkInForm, setWalkInForm] = useState<WalkInForm>(EMPTY_FORM);
  const [walkInLoading, setWalkInLoading] = useState(false);
  const [walkInError, setWalkInError] = useState<string | null>(null);
  const firstNameRef = useRef<HTMLInputElement>(null);
  const walkInFirstNameRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Walk-in QR modal state
  interface QRData { qrCodeDataUrl: string; walkInUrl: string; eventTitle: string }
  const [showQR, setShowQR] = useState(false);
  const [qrData, setQrData] = useState<QRData | null>(null);
  const [qrLoading, setQrLoading] = useState(false);
  const [qrError, setQrError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Donation modal state
  const [showDonation, setShowDonation] = useState(false);
  const [donationForm, setDonationForm] = useState<DonationForm>(EMPTY_DONATION);
  const [donationLoading, setDonationLoading] = useState(false);
  const [donationError, setDonationError] = useState<string | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const addMenuRef = useRef<HTMLDivElement>(null);
  const [deletingDonationId, setDeletingDonationId] = useState<number | null>(null);
  const donorNameRef = useRef<HTMLInputElement>(null);

  // Person-detail overlay (lifted here so data refreshes don't close it)
  const [overlayParticipantId, setOverlayParticipantId] = useState<number | null>(null);

  // ── Auto-Refresh ──────────────────────────────────────────────────────────
  /** Nummer der neuesten Abfrage – ältere Antworten werden verworfen. */
  const latestFetch = useRef(0);
  /** true, solange eine Aktion des Teams läuft; dann pausiert der Takt. */
  const actionBusy = useRef(false);
  /**
   * Anmeldungen, die beim letzten Stand schon bezahlt waren. null = noch kein
   * Stand geladen; beim ersten Laden wird deshalb nichts hervorgehoben.
   */
  const paidBefore = useRef<Set<number> | null>(null);
  /** Gerade eingetroffene Zahlungen – kurz hervorgehoben. */
  const [justPaid, setJustPaid] = useState<Set<number>>(new Set());
  const justPaidTimers = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Waitlist state
  const [waitlistRegLoadingId, setWaitlistRegLoadingId] = useState<number | null>(null);
  const [waitlistPersonLoadingId, setWaitlistPersonLoadingId] = useState<string | null>(null);
  const [waitlistError, setWaitlistError] = useState<string | null>(null);

  // Tab state
  type Tab = "anmeldungen" | "warteliste" | "finanzen" | "spenden";
  const [activeTab, setActiveTab] = useState<Tab>("anmeldungen");

  // Tab bar is horizontally scrollable on mobile – keep the active tab in view
  const tabBarRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<Partial<Record<Tab, HTMLButtonElement | null>>>({});
  useEffect(() => {
    const container = tabBarRef.current;
    const btn = tabRefs.current[activeTab];
    if (!container || !btn) return;
    // All tabs fit (wider viewports) → nothing to scroll
    if (container.scrollWidth <= container.clientWidth) return;
    const cRect = container.getBoundingClientRect();
    const bRect = btn.getBoundingClientRect();
    const gutter = 8; // keep a little breathing room at the edges
    const outLeft = bRect.left - gutter < cRect.left;
    const outRight = bRect.right + gutter > cRect.right;
    if (!outLeft && !outRight) return; // already fully visible
    // Align the tab to the container start – that matches snap-start, otherwise
    // scroll-snap would just pull the scroll position back. Clamped to the end
    // so the last tab stays reachable.
    const maxScroll = container.scrollWidth - container.clientWidth;
    const target = Math.min(Math.max(container.scrollLeft + bRect.left - cRect.left, 0), maxScroll);
    // Scroll only the tab container, never the page
    container.scrollTo({ left: target, behavior: "smooth" });
  }, [activeTab]);

  /**
   * Merkt sich, welche Anmeldungen zwischen zwei Abfragen bezahlt wurden.
   *
   * Genau darum läuft der Takt: am Eingang zahlt jemand per Handy, und das
   * Team soll es an der Zeile sehen, ohne selbst neu zu laden. Die Markierung
   * bleibt eine halbe Minute stehen – lang genug, um sie auch zu bemerken,
   * wenn man zwischendurch woanders hingesehen hat.
   */
  const markNewPayments = useCallback((next: CheckinStatusResponse) => {
    const paidNow = new Set(
      (next.participants ?? []).filter((p) => p.paid_at).map((p) => p.id)
    );
    const before = paidBefore.current;
    paidBefore.current = paidNow;
    if (!before) return; // erster Stand – es ist nichts "neu"

    const fresh = [...paidNow].filter((id) => !before.has(id));
    if (fresh.length === 0) return;

    setJustPaid((prev) => new Set([...prev, ...fresh]));
    const timer = setTimeout(() => {
      setJustPaid((prev) => {
        const rest = new Set(prev);
        for (const id of fresh) rest.delete(id);
        return rest;
      });
    }, 30_000);
    justPaidTimers.current.push(timer);
  }, []);

  // Offene Timer beim Verlassen der Seite aufräumen
  useEffect(
    () => () => {
      for (const timer of justPaidTimers.current) clearTimeout(timer);
    },
    []
  );

  const fetchStatus = useCallback(async () => {
    // Jede Abfrage bekommt eine Nummer. Trifft die Antwort einer älteren
    // Abfrage später ein als die einer neueren, wird sie verworfen – sonst
    // könnte ein Zehn-Sekunden-Takt, der vor einem Check-In gestartet ist,
    // die frische Liste danach wieder auf den alten Stand ziehen.
    const seq = ++latestFetch.current;
    try {
      const [statusRes, finRes] = await Promise.allSettled([
        fetch(`/api/checkin/status/${eventId}`),
        fetch(`/api/admin/events/${eventId}/finances`),
      ]);
      if (seq !== latestFetch.current) return;
      if (statusRes.status === "fulfilled" && statusRes.value.ok) {
        const next = (await statusRes.value.json()) as CheckinStatusResponse;
        if (seq !== latestFetch.current) return;
        markNewPayments(next);
        setData(next);
      }
      if (finRes.status === "fulfilled" && finRes.value.ok) {
        const nextFin = await finRes.value.json();
        if (seq !== latestFetch.current) return;
        setFinancials(nextFin);
      } else if (finRes.status === "fulfilled" && !finRes.value.ok) {
        // API reachable but returned error – show empty financials so section appears
        setFinancials({
          entry_price: null,
          total_costs: 0,
          approved_persons: 0,
          approved_guests: 0,
          expected_revenue: 0,
          checkedin_persons: 0,
          checkedin_guests: 0,
          actual_revenue: 0,
          total_donations: 0,
          donation_count: 0,
          balance: 0,
          costs: [],
          donations: [],
          cash_counted: null,
          cash_counted_at: null,
        });
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [eventId, markNewPayments]);

  /**
   * Der Zehn-Sekunden-Takt – er ist dafür da, dass eingegangene Zahlungen von
   * allein in der Liste auftauchen.
   *
   * Zwei Fälle werden übersprungen, damit er niemandem in die Arbeit fährt:
   * während eine Aktion des Teams läuft (die holt sich die Liste selbst,
   * sobald sie durch ist) und solange die Seite im Hintergrund liegt – ein
   * Handy in der Tasche braucht keine Abfragen. Kommt sie wieder nach vorn,
   * wird sofort aktualisiert statt bis zum nächsten Takt zu warten.
   */
  useEffect(() => {
    fetchStatus();

    const tick = () => {
      if (document.visibilityState === "hidden") return;
      if (actionBusy.current) return;
      fetchStatus();
    };
    const interval = setInterval(tick, 10_000);

    const onVisible = () => {
      if (document.visibilityState === "visible" && !actionBusy.current) fetchStatus();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [fetchStatus]);

  /**
   * Läuft gerade eine Aktion des Teams? Dann hält der Takt still.
   *
   * Der Grund ist nicht die Anzeige, sondern die Reihenfolge: jede Aktion holt
   * sich die Liste selbst, sobald der Server bestätigt hat. Ein Takt, der
   * mitten hinein fällt, liefert den Stand von vorher.
   */
  const busy =
    manualCheckinId !== null ||
    undoId !== null ||
    personLoadingId !== null ||
    waitlistRegLoadingId !== null ||
    waitlistPersonLoadingId !== null ||
    deletingDonationId !== null ||
    walkInLoading ||
    donationLoading ||
    cashSaving;
  useEffect(() => {
    actionBusy.current = busy;
  }, [busy]);

  // Focus first field when walk-in modal opens
  useEffect(() => {
    if (showWalkIn) {
      setTimeout(() => firstNameRef.current?.focus(), 50);
    }
  }, [showWalkIn]);

  // Focus donor name when donation modal opens
  useEffect(() => {
    if (showDonation) {
      setTimeout(() => donorNameRef.current?.focus(), 50);
    }
  }, [showDonation]);

  // Close modals on Escape key
  useEffect(() => {
    if (!showWalkIn) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeWalkIn();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [showWalkIn]);

  useEffect(() => {
    if (!showDonation) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeDonation();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [showDonation]);

  useEffect(() => {
    if (!overlayParticipantId) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOverlayParticipantId(null);
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [overlayParticipantId]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownOpen && !(event.target as Element).closest('.relative')) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [dropdownOpen]);

  // Close "Teilnehmer anmelden" menu on outside click / Escape
  useEffect(() => {
    if (!addOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (!addMenuRef.current?.contains(event.target as Node)) setAddOpen(false);
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAddOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleKey);
    };
  }, [addOpen]);

  function openWalkIn() {
    setWalkInForm(EMPTY_FORM);
    setWalkInError(null);
    setShowWalkIn(true);
  }

  function closeWalkIn() {
    if (walkInLoading) return;
    setShowWalkIn(false);
    setWalkInError(null);
  }

  function openDonation() {
    setDonationForm(EMPTY_DONATION);
    setDonationError(null);
    setShowDonation(true);
  }

  function closeDonation() {
    if (donationLoading) return;
    setShowDonation(false);
    setDonationError(null);
  }

  async function handleDonationSubmit(e: React.FormEvent) {
    e.preventDefault();
    setDonationError(null);
    const amount = parseFloat(donationForm.amount.replace(",", "."));
    if (!donationForm.donor_name.trim()) {
      setDonationError("Name des Spenders ist erforderlich.");
      return;
    }
    if (isNaN(amount) || amount <= 0) {
      setDonationError("Betrag muss größer als 0 sein.");
      return;
    }
    setDonationLoading(true);
    try {
      const res = await fetch(`/api/admin/events/${eventId}/donations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          registration_id: donationForm.registration_id,
          donor_name: donationForm.donor_name.trim(),
          amount,
          note: donationForm.note.trim() || undefined,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        setDonationError(body.error ?? "Fehler beim Speichern.");
      } else {
        // Stay open for quick multi-entry; reset form but keep modal open
        setDonationForm(EMPTY_DONATION);
        await fetchStatus();
        setTimeout(() => donorNameRef.current?.focus(), 50);
      }
    } catch {
      setDonationError("Netzwerkfehler.");
    } finally {
      setDonationLoading(false);
    }
  }

  async function handleDeleteDonation(donationId: number) {
    setDeletingDonationId(donationId);
    try {
      const res = await fetch(`/api/admin/events/${eventId}/donations/${donationId}`, {
        method: "DELETE",
      });
      if (res.ok) await fetchStatus();
    } catch {
      // silent
    } finally {
      setDeletingDonationId(null);
    }
  }

  async function handleShowQR() {
    setQrError(null);
    setShowQR(true);
    if (qrData) return; // already loaded
    setQrLoading(true);
    try {
      const res = await fetch(
        `/api/admin/checkin/walkin-qr?eventId=${eventId}`
      );
      const body = await res.json();
      if (!res.ok) {
        setQrError(body.error ?? "Fehler beim Laden des QR-Codes.");
      } else {
        setQrData(body);
      }
    } catch {
      setQrError("Netzwerkfehler.");
    } finally {
      setQrLoading(false);
    }
  }

  function handleCopyLink() {
    if (!qrData) return;
    navigator.clipboard.writeText(qrData.walkInUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  async function handleWalkInSubmit(e: React.FormEvent) {
    e.preventDefault();
    setWalkInError(null);
    setWalkInLoading(true);
    try {
      const res = await fetch("/api/checkin/walkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event_id: Number(eventId),
          persons: walkInForm.persons,
          email: walkInForm.email,
          phone: walkInForm.phone || undefined,
          notes: walkInForm.notes || undefined,
          sendEmail: walkInForm.sendEmail,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        setWalkInError(body.error ?? "Fehler beim Hinzufügen.");
      } else {
        setShowWalkIn(false);
        await fetchStatus();
      }
    } catch {
      setWalkInError("Netzwerkfehler.");
    } finally {
      setWalkInLoading(false);
    }
  }

  async function handlePersonCheckin(personId: string) {
    setPersonLoadingId(personId);
    setError(null);
    try {
      const res = await fetch(`/api/checkin/persons/${personId}`, { method: "POST" });
      const body = await res.json();
      if (!res.ok) setError(body.error ?? "Fehler beim Person-Check-In.");
      else await fetchStatus();
    } catch {
      setError("Netzwerkfehler.");
    } finally {
      setPersonLoadingId(null);
    }
  }

  async function handlePersonUndo(personId: string) {
    setPersonLoadingId(personId);
    setError(null);
    try {
      const res = await fetch(`/api/checkin/persons/${personId}`, { method: "DELETE" });
      const body = await res.json();
      if (!res.ok) setError(body.error ?? "Fehler beim Rückgängig.");
      else await fetchStatus();
    } catch {
      setError("Netzwerkfehler.");
    } finally {
      setPersonLoadingId(null);
    }
  }

  /**
   * Confirms a waitlist entry. Without options the registration is only
   * approved (the guest gets the approval email + QR code); with personIds or
   * checkinAll the selected persons are checked in right away.
   */
  async function handleWaitlistConfirm(
    registrationId: number,
    options: { personIds?: string[]; checkinAll?: boolean } = {}
  ) {
    const personId = options.personIds?.length === 1 ? options.personIds[0] : null;
    if (personId) setWaitlistPersonLoadingId(personId);
    else setWaitlistRegLoadingId(registrationId);
    setWaitlistError(null);
    try {
      const res = await fetch("/api/checkin/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ registrationId, ...options }),
      });
      const body = await res.json();
      if (!res.ok) setWaitlistError(body.error ?? "Fehler beim Bestätigen.");
      else await fetchStatus();
    } catch {
      setWaitlistError("Netzwerkfehler.");
    } finally {
      setWaitlistPersonLoadingId(null);
      setWaitlistRegLoadingId(null);
    }
  }

  /**
   * Bietet einer Wartelisten-Anmeldung einen frei gewordenen Platz an. Die
   * Anmeldung bleibt offen – sie wird nur zahlbar und bekommt eine E-Mail.
   */
  async function handleWaitlistOffer(registrationId: number) {
    setWaitlistRegLoadingId(registrationId);
    setWaitlistError(null);
    try {
      const res = await fetch("/api/checkin/waitlist/offer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ registrationId }),
      });
      const body = await res.json();
      if (!res.ok) setWaitlistError(body.error ?? "Fehler beim Anbieten des Platzes.");
      else await fetchStatus();
    } catch {
      setWaitlistError("Netzwerkfehler.");
    } finally {
      setWaitlistRegLoadingId(null);
    }
  }

  async function handleUndo(participantId: number) {
    setUndoId(participantId);
    setError(null);
    try {
      const res = await fetch("/api/checkin/undo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ registrationId: participantId }),
      });
      const body = await res.json();
      if (!res.ok) setError(body.error ?? "Fehler beim Auschecken.");
      else await fetchStatus();
    } catch {
      setError("Netzwerkfehler.");
    } finally {
      setUndoId(null);
    }
  }

  async function handleManualCheckin(participantId: number) {
    setManualCheckinId(participantId);
    setError(null);
    try {
      const res = await fetch("/api/checkin/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ registrationId: participantId }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? "Fehler beim Check-In.");
      } else {
        await fetchStatus();
      }
    } catch {
      setError("Netzwerkfehler.");
    } finally {
      setManualCheckinId(null);
    }
  }

  async function handleSaveCashCount(e: React.FormEvent) {
    e.preventDefault();
    setCashError(null);
    const amount = parseFloat(cashInput.replace(",", "."));
    if (isNaN(amount) || amount < 0) {
      setCashError("Bitte einen gültigen Betrag eingeben.");
      return;
    }
    setCashSaving(true);
    try {
      const res = await fetch(`/api/admin/events/${eventId}/cash-count`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount }),
      });
      const body = await res.json();
      if (!res.ok) {
        setCashError(body.error ?? "Fehler beim Speichern.");
      } else {
        await fetchStatus();
        setCashInput("");
      }
    } catch {
      setCashError("Netzwerkfehler.");
    } finally {
      setCashSaving(false);
    }
  }

  function exportCSV() {
    if (!data) return;
    const rows = [
      ["Name", "E-Mail", "Telefon", "Begleiter", "Status", "Eingecheckt um", "Walk-in", "Bemerkung"],
      ...data.participants.map((p) => [
        `${p.first_name} ${p.last_name}`,
        p.email ?? "",
        p.phone ?? "",
        String(p.guests),
        p.checked_in_at ? "Eingecheckt" : "Ausstehend",
        formatTime(p.checked_in_at) ?? "",
        p.is_walk_in ? "Ja" : "Nein",
        p.notes ?? "",
      ]),
    ];
    const csv = rows.map((r) => r.map((v) => `"${v}"`).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `checkin-event-${eventId}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const filtered = (data?.participants ?? []).filter((p: CheckinParticipant) => {
    const q = search.toLowerCase();
    return (
      p.first_name.toLowerCase().includes(q) ||
      p.last_name.toLowerCase().includes(q) ||
      (p.email?.toLowerCase().includes(q) ?? false)
    );
  });

  const waitlist = data?.waitlist ?? [];
  const waitlistFiltered = waitlist.filter((w: WaitlistEntry) => {
    const q = search.toLowerCase();
    return (
      w.persons.some((p) =>
        `${p.first_name} ${p.last_name}`.toLowerCase().includes(q)
      ) ||
      `${w.first_name} ${w.last_name}`.toLowerCase().includes(q) ||
      (w.email?.toLowerCase().includes(q) ?? false)
    );
  });

  const checkedInFiltered = filtered.filter((p) => p.checked_in_at !== null);
  const missingFiltered = filtered.filter((p) => p.checked_in_at === null);
  const overlayParticipant = (data?.participants ?? []).find((p) => p.id === overlayParticipantId) ?? null;

  const progressPct = data && data.total > 0 ? Math.round((data.checked_in / data.total) * 100) : 0;

  return (
    <div className="p-0 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Check-In Dashboard</h1>
          <p className="text-sm text-gray-500 mt-0.5">Event #{eventId} · Live-Übersicht</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
          {/* Primär: Scanner Button - full width on mobile */}
          <button
            onClick={() => router.push(`/admin/events/${eventId}/scanner`)}
            className="flex items-center justify-center gap-3 px-6 py-3 bg-green-700 hover:bg-green-800 text-white rounded-lg text-base font-semibold transition-colors shadow-md w-full sm:w-auto"
          >
            <QrCode className="w-5 h-5" />
            Scanner öffnen
          </button>

          {/* Sekundär + Tertiär: 2-col grid on mobile, flex row on desktop */}
          <div className="grid grid-cols-2 gap-2 sm:flex sm:gap-2">
            {/* Sekundär: Teilnehmer anmelden (QR oder manuell) */}
            <div className="relative" ref={addMenuRef}>
              <button
                onClick={() => setAddOpen((o) => !o)}
                aria-haspopup="menu"
                aria-expanded={addOpen}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
              >
                <UserPlus className="w-4 h-4" />
                <span className="hidden sm:inline">Teilnehmer anmelden</span>
                <span className="sm:hidden">Anmelden</span>
                <ChevronDown className={`w-4 h-4 transition-transform ${addOpen ? "rotate-180" : ""}`} />
              </button>
              {addOpen && (
                <div
                  role="menu"
                  className="absolute left-0 sm:left-auto sm:right-0 mt-1 w-72 max-w-[calc(100vw-3rem)] bg-white border border-gray-200 rounded-lg shadow-lg z-20 overflow-hidden"
                >
                  <button
                    role="menuitem"
                    onClick={() => { setAddOpen(false); handleShowQR(); }}
                    className="flex items-start gap-3 w-full px-3 py-3 text-left hover:bg-gray-50 transition-colors"
                  >
                    <Smartphone className="w-4 h-4 mt-0.5 shrink-0 text-violet-600" />
                    <span>
                      <span className="block text-sm font-medium text-gray-900">QR-Code anzeigen</span>
                      <span className="block text-xs text-gray-500 mt-0.5">
                        Teilnehmer melden sich selbst am Handy an
                      </span>
                    </span>
                  </button>
                  <button
                    role="menuitem"
                    onClick={() => { setAddOpen(false); openWalkIn(); }}
                    className="flex items-start gap-3 w-full px-3 py-3 text-left hover:bg-gray-50 border-t border-gray-100 transition-colors"
                  >
                    <PenLine className="w-4 h-4 mt-0.5 shrink-0 text-blue-600" />
                    <span>
                      <span className="block text-sm font-medium text-gray-900">Selbst eintragen</span>
                      <span className="block text-xs text-gray-500 mt-0.5">
                        Daten des Teilnehmers hier vor Ort erfassen
                      </span>
                    </span>
                  </button>
                </div>
              )}
            </div>

            {/* Tertiär: Dropdown für Mehr */}
            <div className="relative">
              <button
                onClick={() => setDropdownOpen(!dropdownOpen)}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 border border-gray-200 hover:bg-gray-50 rounded-lg text-sm text-gray-600 transition-colors"
              >
                <MoreHorizontal className="w-4 h-4" />
                Mehr
              </button>
              {dropdownOpen && (
                <div className="absolute right-0 mt-1 w-48 bg-white border border-gray-200 rounded-lg shadow-lg z-10">
                  <button
                    onClick={() => { setDropdownOpen(false); openDonation(); }}
                    className="flex items-center gap-2 w-full px-3 py-2 text-left hover:bg-gray-50 text-sm text-gray-700"
                  >
                    <Heart className="w-4 h-4" />
                    Spende eintragen
                  </button>
                  <button
                    onClick={() => { setDropdownOpen(false); fetchStatus(); }}
                    className="flex items-center gap-2 w-full px-3 py-2 text-left hover:bg-gray-50 text-sm text-gray-700"
                  >
                    <RefreshCw className="w-4 h-4" />
                    Aktualisieren
                  </button>
                  <button
                    onClick={() => { setDropdownOpen(false); exportCSV(); }}
                    disabled={!data}
                    className="flex items-center gap-2 w-full px-3 py-2 text-left hover:bg-gray-50 disabled:opacity-50 text-sm text-gray-700"
                  >
                    <Download className="w-4 h-4" />
                    CSV
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <RefreshCw className="w-6 h-6 animate-spin text-green-600" />
        </div>
      ) : !data ? (
        <p className="text-center text-gray-500 py-20">Keine Daten verfügbar.</p>
      ) : (
        <>
          {/* Stats cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white rounded-xl border border-gray-100 p-5 flex items-center gap-4">
              <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center">
                <Users className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{data.total}</p>
                <p className="text-sm text-gray-500">Personen gesamt</p>
              </div>
            </div>
            <div className="bg-white rounded-xl border border-gray-100 p-5 flex items-center gap-4">
              <div className="w-10 h-10 bg-green-50 rounded-lg flex items-center justify-center">
                <CheckCircle2 className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-green-700">
                  {data.checked_in} <span className="text-base font-medium text-gray-400">/ {data.total}</span>
                </p>
                <p className="text-sm text-gray-500">Eingecheckt</p>
              </div>
            </div>
            <div className="bg-white rounded-xl border border-gray-100 p-5 flex items-center gap-4">
              <div className="w-10 h-10 bg-amber-50 rounded-lg flex items-center justify-center">
                <Clock className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-amber-700">{data.missing}</p>
                <p className="text-sm text-gray-500">Ausstehend</p>
              </div>
            </div>
          </div>

          {/* Progress bar */}
          <div className="bg-white rounded-xl border border-gray-100 p-5">
            <div className="flex justify-between text-sm font-medium text-gray-600 mb-2">
              <span>Fortschritt</span>
              <span>{progressPct}%</span>
            </div>
            <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-green-500 rounded-full transition-all duration-700"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <p className="text-xs text-gray-400 mt-2">
              {data.checked_in} von {data.total} Personen eingecheckt
            </p>
            <p className="text-xs text-gray-400 mt-0.5">
              {data.total_registrations} Anmeldungen · {data.total_guests} Begleitpersonen
            </p>
            <p className="text-xs text-gray-400 mt-2 pt-2 border-t border-gray-100">
              🚶 {data.walk_in_registrations} Walk-ins{data.walk_in_guests > 0 ? ` (+ ${data.walk_in_guests} Begleitpersonen)` : ""}
            </p>
            {data.waitlist_registrations > 0 && (
              <p className="text-xs text-amber-600 mt-0.5">
                ⏳ {data.waitlist_registrations} Anmeldung{data.waitlist_registrations !== 1 ? "en" : ""} auf der Warteliste ({data.waitlist_persons} Person{data.waitlist_persons !== 1 ? "en" : ""})
              </p>
            )}
          </div>

          {/* ── Tab bar ── */}
          {/* w-0 min-w-full: der Admin-Container (AdminMain) nutzt min-w-min, wodurch
              die Tab-Leiste sonst auf ihre volle Inhaltsbreite aufgezogen wird und
              statt ihrer der ganze Inhaltsbereich horizontal scrollt. Mit Breite 0 +
              min-width 100% traegt sie nichts zur min-content-Breite bei und scrollt
              selbst. */}
          <div
            ref={tabBarRef}
            className="w-0 min-w-full flex gap-1 bg-gray-100 rounded-xl p-1 overflow-x-auto scrollbar-hide snap-x snap-mandatory"
          >
            {(
              [
                {
                  key: "anmeldungen" as const,
                  label: "Anmeldungen",
                  icon: <Users className="w-4 h-4" />,
                  badge: data.missing > 0 ? String(data.missing) : null,
                  badgeColor: "bg-amber-500",
                },
                {
                  key: "warteliste" as const,
                  label: "Warteliste",
                  icon: <Hourglass className="w-4 h-4" />,
                  badge: data.waitlist_persons > 0 ? String(data.waitlist_persons) : null,
                  badgeColor: "bg-amber-600",
                },
                {
                  key: "finanzen" as const,
                  label: "Finanzen",
                  icon: <Euro className="w-4 h-4" />,
                  badge: financials?.cash_counted != null ? "✓" : null,
                  badgeColor: "bg-green-600",
                },
                {
                  key: "spenden" as const,
                  label: "Spenden",
                  icon: <Heart className="w-4 h-4" />,
                  badge: (financials?.donation_count ?? 0) > 0 ? String(financials!.donation_count) : null,
                  badgeColor: "bg-rose-500",
                },
              ] as { key: Tab; label: string; icon: React.ReactNode; badge: string | null; badgeColor: string }[]
            ).map((tab) => (
              <button
                key={tab.key}
                ref={(el) => {
                  tabRefs.current[tab.key] = el;
                }}
                onClick={() => setActiveTab(tab.key)}
                className={`flex-none snap-start flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap sm:flex-1 ${
                  activeTab === tab.key
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                {tab.icon}
                <span className="hidden sm:inline">{tab.label}</span>
                <span className="sm:hidden">
                  {tab.key === "anmeldungen"
                    ? "Liste"
                    : tab.key === "warteliste"
                      ? "Warten"
                      : tab.key === "finanzen"
                        ? "Finanzen"
                        : "Spenden"}
                </span>
                {tab.badge && (
                  <span className={`${tab.badgeColor} text-white text-xs rounded-full min-w-[1.25rem] h-5 px-1 flex items-center justify-center font-bold leading-none`}>
                    {tab.badge}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* ── Tab: Anmeldungen ── */}
          {activeTab === "anmeldungen" && (
            <>
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Name oder E-Mail suchen…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white"
                />
              </div>

              {error && (
                <p className="text-sm text-red-600 bg-red-50 rounded-lg px-4 py-2">{error}</p>
              )}

              {/* Participant list – missing first, then checked in */}
              <div className="space-y-2">
                {missingFiltered.length > 0 && (
                  <>
                    <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide px-1">
                      Ausstehend ({missingFiltered.length})
                    </h3>
                    {missingFiltered.map((p) => (
                      <ParticipantRow
                        key={p.id}
                        participant={p}
                        onManualCheckin={handleManualCheckin}
                        onUndo={handleUndo}
                        loadingId={manualCheckinId}
                        undoId={undoId}
                        onPersonCheckin={handlePersonCheckin}
                        onPersonUndo={handlePersonUndo}
                        personLoadingId={personLoadingId}
                        onOpenOverlay={setOverlayParticipantId}
                        paymentJustArrived={justPaid.has(p.id)}
                      />
                    ))}
                  </>
                )}
                {checkedInFiltered.length > 0 && (
                  <>
                    <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide px-1 pt-2">
                      Eingecheckt ({checkedInFiltered.length})
                    </h3>
                    {checkedInFiltered.map((p) => (
                      <ParticipantRow
                        key={p.id}
                        participant={p}
                        onManualCheckin={handleManualCheckin}
                        onUndo={handleUndo}
                        loadingId={manualCheckinId}
                        undoId={undoId}
                        onPersonCheckin={handlePersonCheckin}
                        onPersonUndo={handlePersonUndo}
                        personLoadingId={personLoadingId}
                        onOpenOverlay={setOverlayParticipantId}
                        paymentJustArrived={justPaid.has(p.id)}
                      />
                    ))}
                  </>
                )}
                {filtered.length === 0 && (
                  <p className="text-center text-gray-400 py-10 text-sm">
                    {search
                      ? "Keine Teilnehmer gefunden."
                      : "Noch keine Teilnehmer – Teilnehmer können manuell oder per Walk-in hinzugefügt werden."}
                  </p>
                )}
              </div>
            </>
          )}

          {/* ── Tab: Warteliste ── */}
          {activeTab === "warteliste" && (
            <>
              <div className="bg-amber-50 border border-amber-100 rounded-xl px-4 py-3">
                <p className="text-sm text-amber-900 font-medium flex items-center gap-2">
                  <Hourglass className="w-4 h-4 shrink-0" />
                  Warteliste – noch nicht bestätigte Anmeldungen
                </p>
                <p className="text-xs text-amber-700 mt-1">
                  Diese Anmeldungen sind eingegangen, als das Event bereits ausgebucht war.
                  Wird ein Platz frei, biete ihn mit „Platz anbieten“ an: die Anmeldung
                  kann dann bezahlen und bekommt eine E-Mail. „Bestätigen“ überspringt die
                  Zahlung und schickt direkt die Bestätigung mit QR-Code.
                </p>
              </div>

              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Name oder E-Mail suchen…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 bg-white"
                />
              </div>

              {waitlistError && (
                <p className="text-sm text-red-600 bg-red-50 rounded-lg px-4 py-2">{waitlistError}</p>
              )}

              <div className="space-y-2">
                {waitlistFiltered.map((entry) => (
                  <WaitlistRow
                    key={entry.id}
                    entry={entry}
                    position={waitlist.indexOf(entry) + 1}
                    onConfirm={handleWaitlistConfirm}
                    onOffer={handleWaitlistOffer}
                    regLoadingId={waitlistRegLoadingId}
                    personLoadingId={waitlistPersonLoadingId}
                  />
                ))}
                {waitlistFiltered.length === 0 && (
                  <p className="text-center text-gray-400 py-10 text-sm">
                    {search
                      ? "Keine Wartelisten-Einträge gefunden."
                      : "Niemand auf der Warteliste – alle Anmeldungen sind bearbeitet."}
                  </p>
                )}
              </div>
            </>
          )}

          {/* ── Tab: Finanzen ── */}
          {activeTab === "finanzen" && (
            <>
              {financials ? (
                <>
                  {/* Finance summary cards */}
                  <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-3">
                    <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                      <Euro className="w-4 h-4 text-indigo-500" />
                      Übersicht
                    </h2>
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                      {/* Gesamtkosten */}
                      <div className="bg-gray-50 rounded-lg p-3 space-y-1">
                        <p className="text-xs text-gray-500">Gesamtkosten</p>
                        <p className="text-base font-bold text-gray-900">{formatEuro(financials.total_costs)}</p>
                      </div>

                      {/* Erwarteter Umsatz */}
                      {financials.entry_price != null || financials.child_entry_price != null || financials.expected_revenue > 0 || financials.actual_revenue > 0 ? (
                        <div className="bg-blue-50 rounded-lg p-3 space-y-1">
                          <p className="text-xs text-blue-700">Erw. Umsatz</p>
                          <p className="text-base font-bold text-blue-900">{formatEuro(financials.expected_revenue)}</p>
                          <p className="text-xs text-blue-600">
                            {financials.approved_persons} bestätigte Personen · jeweiliger Eintrittspreis
                          </p>
                        </div>
                      ) : (
                        <div className="bg-gray-50 rounded-lg p-3 space-y-1">
                          <p className="text-xs text-gray-500">Erw. Umsatz</p>
                          <p className="text-sm text-gray-400 italic">Kein Preis</p>
                        </div>
                      )}

                      {/* Tatsächlicher Umsatz */}
                      {financials.entry_price != null || financials.child_entry_price != null || financials.expected_revenue > 0 || financials.actual_revenue > 0 ? (
                        <div className="bg-green-50 rounded-lg p-3 space-y-1">
                          <p className="text-xs text-green-700">Tats. Umsatz</p>
                          {financials.cash_counted != null ? (
                            <p className="text-base font-bold text-green-900 flex items-baseline gap-1.5 flex-wrap">
                              <span className="line-through text-green-700/60 font-medium">{formatEuro(financials.actual_revenue)}</span>
                              <span>{formatEuro(financials.cash_counted)}</span>
                            </p>
                          ) : (
                            <p className="text-base font-bold text-green-900">{formatEuro(financials.actual_revenue)}</p>
                          )}
                          <p className="text-xs text-green-600">
                            {financials.cash_counted != null
                              ? "Kassenabschluss"
                              : <>{financials.checkedin_persons} eingecheckte Personen · jeweiliger Eintrittspreis</>}
                          </p>
                        </div>
                      ) : (
                        <div className="bg-gray-50 rounded-lg p-3 space-y-1">
                          <p className="text-xs text-gray-500">Tats. Umsatz</p>
                          <p className="text-sm text-gray-400 italic">Kein Preis</p>
                        </div>
                      )}

                      {/* Spenden */}
                      <div className="bg-rose-50 rounded-lg p-3 space-y-1">
                        <p className="text-xs text-rose-700 flex items-center gap-1">
                          <Heart className="w-3 h-3" />
                          Spenden
                        </p>
                        <p className="text-base font-bold text-rose-900">{formatEuro(financials.total_donations ?? 0)}</p>
                        <p className="text-xs text-rose-600">{financials.donation_count ?? 0} Spende{(financials.donation_count ?? 0) !== 1 ? "n" : ""}</p>
                      </div>

                      {/* Bilanz */}
                      {(financials.entry_price != null || financials.child_entry_price != null || financials.expected_revenue > 0 || financials.actual_revenue > 0) || (financials.total_donations ?? 0) > 0 || financials.total_costs > 0 ? (
                        <div className={`rounded-lg p-3 space-y-1 ${financials.balance > 0 ? "bg-green-100" : financials.balance < 0 ? "bg-red-100" : "bg-gray-50"}`}>
                          <p className={`text-xs ${financials.balance > 0 ? "text-green-700" : financials.balance < 0 ? "text-red-700" : "text-gray-500"}`}>Bilanz</p>
                          <p className={`text-base font-bold ${financials.balance > 0 ? "text-green-800" : financials.balance < 0 ? "text-red-800" : "text-gray-700"}`}>
                            {financials.balance > 0 ? "+" : ""}{formatEuro(financials.balance)}
                          </p>
                          <p className={`text-xs ${financials.balance > 0 ? "text-green-600" : financials.balance < 0 ? "text-red-600" : "text-gray-400"}`}>
                            {financials.balance > 0 ? "Überschuss" : financials.balance < 0 ? "Defizit" : "Ausgeglichen"}
                          </p>
                        </div>
                      ) : (
                        <div className="bg-gray-50 rounded-lg p-3 space-y-1">
                          <p className="text-xs text-gray-500">Bilanz</p>
                          <p className="text-sm text-gray-400 italic">–</p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Kassenabschluss */}
                  <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-3">
                    <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                      <Banknote className="w-4 h-4 text-gray-500" />
                      Kassenabschluss
                    </h2>

                    {financials.cash_counted != null ? (
                      (() => {
                        const einlass = financials.actual_revenue ?? 0;
                        const spenden = financials.total_donations ?? 0;
                        const diff = Math.round((financials.cash_counted - einlass) * 100) / 100;
                        const isMatch = diff === 0;
                        return (
                          <div className="space-y-2">
                            <div className={`rounded-xl border px-4 py-3 flex items-start gap-3 ${isMatch ? "bg-green-50 border-green-200" : "bg-amber-50 border-amber-200"}`}>
                              {isMatch ? (
                                <BadgeCheck className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />
                              ) : (
                                <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                              )}
                              <div className="flex-1 min-w-0">
                                <p className={`text-sm font-semibold ${isMatch ? "text-green-800" : "text-amber-800"}`}>
                                  {isMatch ? "Einlasskasse bestätigt" : "Abweichung Einlasskasse"}
                                </p>
                                <p className={`text-xs mt-0.5 ${isMatch ? "text-green-700" : "text-amber-700"}`}>
                                  Gezählt: <strong>{formatEuro(financials.cash_counted)}</strong>
                                  {" · "}Erwartet: <strong>{formatEuro(einlass)}</strong>
                                  {!isMatch && <> · Differenz: <strong>{diff > 0 ? "+" : ""}{formatEuro(diff)}</strong></>}
                                </p>
                                {financials.cash_counted_at && (
                                  <p className="text-xs text-gray-400 mt-1">
                                    Eingetragen: {new Date(financials.cash_counted_at).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                                  </p>
                                )}
                              </div>
                            </div>
                            {spenden > 0 && (
                              <div className="rounded-lg border border-gray-100 bg-gray-50 px-4 py-2 text-xs text-gray-500 flex justify-between items-center">
                                <span>+ Spenden</span>
                                <span className="font-medium text-rose-600">{formatEuro(spenden)}</span>
                              </div>
                            )}
                            {spenden > 0 && (
                              <div className="rounded-lg border border-gray-100 bg-gray-50 px-4 py-2 text-xs text-gray-600 flex justify-between items-center font-medium">
                                <span>= Gesamt</span>
                                <span>{formatEuro(financials.cash_counted + spenden)}</span>
                              </div>
                            )}
                          </div>
                        );
                      })()
                    ) : (
                      <p className="text-sm text-gray-400 italic">Noch kein Kassenabschluss eingetragen.</p>
                    )}

                    <form onSubmit={handleSaveCashCount} className="flex gap-2 items-end pt-1">
                      <div className="flex-1">
                        <label className="block text-xs font-medium text-gray-600 mb-1">
                          {financials.cash_counted != null ? "Neuen Wert eintragen" : "Kassenbestand eintragen"}
                        </label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">€</span>
                          <input
                            type="text"
                            inputMode="decimal"
                            value={cashInput}
                            onChange={(e) => { setCashInput(e.target.value); setCashError(null); }}
                            placeholder="0,00"
                            className="w-full pl-7 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white"
                          />
                        </div>
                      </div>
                      <button
                        type="submit"
                        disabled={cashSaving || !cashInput.trim()}
                        className="flex items-center gap-1.5 px-3 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors whitespace-nowrap"
                      >
                        {cashSaving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                        Speichern
                      </button>
                    </form>
                    {cashError && <p className="text-xs text-red-600">{cashError}</p>}
                  </div>
                </>
              ) : (
                <div className="bg-white rounded-xl border border-gray-100 p-8 text-center">
                  <Euro className="w-8 h-8 text-gray-200 mx-auto mb-2" />
                  <p className="text-sm text-gray-400">Finanzdaten werden geladen…</p>
                </div>
              )}
            </>
          )}

          {/* ── Tab: Spenden ── */}
          {activeTab === "spenden" && (
            <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                  <Heart className="w-4 h-4 text-rose-500" />
                  Spenden ({financials?.donation_count ?? 0})
                </h2>
                <button
                  onClick={openDonation}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-lg text-xs font-medium transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Spende eintragen
                </button>
              </div>

              {(financials?.donations ?? []).length === 0 ? (
                <div className="py-8 text-center">
                  <Heart className="w-8 h-8 text-gray-200 mx-auto mb-2" />
                  <p className="text-sm text-gray-400">Noch keine Spenden erfasst.</p>
                  <button
                    onClick={openDonation}
                    className="mt-3 inline-flex items-center gap-1.5 px-4 py-2 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-lg text-sm font-medium transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    Erste Spende eintragen
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  {(financials!.donations).map((d: EventDonation) => (
                    <div key={d.id} className="flex items-start justify-between gap-3 rounded-lg border border-rose-100 bg-rose-50/40 px-3 py-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-gray-900">{d.donor_name}</p>
                        {d.note && <p className="text-xs text-gray-500 truncate">{d.note}</p>}
                        <p className="text-xs text-gray-400 mt-0.5">
                          {new Date(d.created_at).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-sm font-bold text-rose-700">{formatEuro(d.amount)}</span>
                        <button
                          onClick={() => handleDeleteDonation(d.id)}
                          disabled={deletingDonationId === d.id}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-50"
                          title="Spende löschen"
                        >
                          {deletingDonationId === d.id ? (
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                    </div>
                  ))}
                  <div className="flex justify-end pt-1 border-t border-gray-100">
                    <p className="text-sm font-semibold text-gray-700">
                      Gesamt: <span className="text-rose-700">{formatEuro(financials!.total_donations ?? 0)}</span>
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Walk-in Modal */}
      {showWalkIn && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
          onClick={(e) => { if (e.target === e.currentTarget) closeWalkIn(); }}
        >
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            {/* Modal header */}
            <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-blue-600" />
                <h2 className="text-lg font-semibold text-gray-900">Walk-in hinzufügen</h2>
              </div>
              <button
                onClick={closeWalkIn}
                disabled={walkInLoading}
                className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-50"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal form */}
            <form onSubmit={handleWalkInSubmit} className="px-6 py-5 space-y-4">
              {/* E-Mail (required) */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  E-Mail <span className="text-red-500">*</span>
                </label>
                <input
                  ref={firstNameRef}
                  type="email"
                  required
                  value={walkInForm.email}
                  onChange={(e) => setWalkInForm((f) => ({ ...f, email: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="max@beispiel.de"
                />
              </div>

              {/* Telefon */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Telefonnummer <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <input
                  type="tel"
                  value={walkInForm.phone}
                  onChange={(e) => setWalkInForm((f) => ({ ...f, phone: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="0151 12345678"
                />
              </div>

              {/* Persons list */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-gray-700">
                    Personen <span className="text-red-500">*</span>
                  </label>
                  <span className="text-xs text-gray-400">{walkInForm.persons.length} Person{walkInForm.persons.length !== 1 ? "en" : ""}</span>
                </div>
                {walkInForm.persons.map((person, idx) => (
                  <div key={idx} className="border border-gray-100 rounded-lg p-3 bg-gray-50 space-y-2">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium text-gray-500">
                        Person {idx + 1}{idx === 0 && <span className="ml-1 text-gray-400">(Walk-in)</span>}
                      </span>
                      {walkInForm.persons.length > 1 && (
                        <button
                          type="button"
                          onClick={() => setWalkInForm((f) => ({ ...f, persons: f.persons.filter((_, i) => i !== idx) }))}
                          className="p-1 rounded text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        ref={(el) => { walkInFirstNameRefs.current[idx] = el; }}
                        type="text"
                        required
                        value={person.firstName}
                        maxLength={50}
                        onChange={(e) => setWalkInForm((f) => ({
                          ...f,
                          persons: f.persons.map((p, i) => i === idx ? { ...p, firstName: e.target.value } : p),
                        }))}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="Vorname"
                      />
                      <LastNameInput
                        required
                        value={person.lastName}
                        maxLength={50}
                        onChange={(v) => setWalkInForm((f) => ({
                          ...f,
                          persons: f.persons.map((p, i) => i === idx ? { ...p, lastName: v } : p),
                        }))}
                        siblings={walkInForm.persons.filter((_, i) => i !== idx).map((p) => p.lastName)}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    const newIdx = walkInForm.persons.length;
                    flushSync(() => {
                      setWalkInForm((f) => ({ ...f, persons: [...f.persons, { firstName: "", lastName: "" }] }));
                    });
                    walkInFirstNameRefs.current[newIdx]?.focus();
                  }}
                  className="w-full flex items-center justify-center gap-2 py-2 border border-dashed border-gray-300 rounded-lg text-sm text-gray-500 hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  Person hinzufügen
                </button>
              </div>

              {/* Bemerkung */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Bemerkung <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <textarea
                  value={walkInForm.notes}
                  onChange={(e) => setWalkInForm((f) => ({ ...f, notes: e.target.value }))}
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  placeholder="z.B. Kam mit Mitglied XY, Schnuppertraining…"
                />
              </div>

              {/* Zahlungs-Mail */}
              <label className="flex items-start gap-2.5 cursor-pointer rounded-lg border border-gray-200 px-3 py-2.5 hover:bg-gray-50 transition-colors">
                <input
                  type="checkbox"
                  checked={walkInForm.sendEmail}
                  onChange={(e) => setWalkInForm((f) => ({ ...f, sendEmail: e.target.checked }))}
                  className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                />
                <span className="text-xs text-gray-700">
                  <span className="font-medium">E-Mail mit Zahlungslink senden</span>
                  <span className="block text-gray-500 mt-0.5">
                    {walkInForm.sendEmail
                      ? "Nennt den Teilnahmebetrag und führt auf die Status-Seite. Es wird noch niemand eingecheckt – das macht ihr, sobald bezahlt wurde."
                      : "Ohne Mail gilt der Walk-in als vor Ort bezahlt und wird sofort eingecheckt."}
                  </span>
                </span>
              </label>

              {walkInError && (
                <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{walkInError}</p>
              )}

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={closeWalkIn}
                  disabled={walkInLoading}
                  className="flex-1 px-4 py-2.5 border border-gray-200 text-gray-600 hover:bg-gray-50 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                >
                  Abbrechen
                </button>
                <button
                  type="submit"
                  disabled={walkInLoading}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                >
                  {walkInLoading ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <UserCheck className="w-4 h-4" />
                  )}
                  {walkInForm.persons.length}{" "}
                  {walkInForm.persons.length === 1 ? "Person" : "Personen"}{" "}
                  {walkInForm.sendEmail ? "hinzufügen" : "einchecken"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Donation Modal */}
      {showDonation && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
          onClick={(e) => { if (e.target === e.currentTarget) closeDonation(); }}
        >
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            {/* Header */}
            <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <Heart className="w-5 h-5 text-rose-500" />
                <h2 className="text-lg font-semibold text-gray-900">Spende eintragen</h2>
              </div>
              <button
                onClick={closeDonation}
                disabled={donationLoading}
                className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-50"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleDonationSubmit} className="px-6 py-5 space-y-4">
              {/* Participant select or external donor */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Teilnehmer <span className="text-gray-400 font-normal">(optional – für registrierte Teilnehmer)</span>
                </label>
                <select
                  value={donationForm.registration_id ?? ""}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (!val) {
                      setDonationForm((f) => ({ ...f, registration_id: null, donor_name: "" }));
                    } else {
                      const participant = data?.participants.find((p) => p.id === Number(val));
                      setDonationForm((f) => ({
                        ...f,
                        registration_id: Number(val),
                        donor_name: participant ? `${participant.first_name} ${participant.last_name}` : f.donor_name,
                      }));
                    }
                  }}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-rose-400 bg-white"
                >
                  <option value="">— Externer Spender —</option>
                  {(data?.participants ?? []).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.first_name} {p.last_name}{p.guests > 0 ? ` (+${p.guests})` : ""}
                    </option>
                  ))}
                </select>
              </div>

              {/* Donor name */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Name des Spenders <span className="text-red-500">*</span>
                </label>
                <input
                  ref={donorNameRef}
                  type="text"
                  required
                  maxLength={254}
                  value={donationForm.donor_name}
                  onChange={(e) => setDonationForm((f) => ({ ...f, donor_name: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-rose-400"
                  placeholder="Max Mustermann"
                />
              </div>

              {/* Amount */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Betrag (€) <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  required
                  value={donationForm.amount}
                  max={999_999_999}
                  onChange={(e) => setDonationForm((f) => ({ ...f, amount: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-rose-400"
                  placeholder="10,00"
                />
              </div>

              {/* Note */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Kommentar <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <input
                  type="text"
                  maxLength={200}
                  value={donationForm.note}
                  onChange={(e) => setDonationForm((f) => ({ ...f, note: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-rose-400"
                  placeholder="z.B. Für die Jugendarbeit"
                />
              </div>

              {donationError && (
                <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{donationError}</p>
              )}

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={closeDonation}
                  disabled={donationLoading}
                  className="flex-1 px-4 py-2.5 border border-gray-200 text-gray-600 hover:bg-gray-50 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                >
                  Schließen
                </button>
                <button
                  type="submit"
                  disabled={donationLoading}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-rose-500 hover:bg-rose-600 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                >
                  {donationLoading ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <Heart className="w-4 h-4" />
                  )}
                  Spende speichern
                </button>
              </div>

              <p className="text-xs text-gray-400 text-center">
                Nach dem Speichern bleibt das Formular offen für weitere Eingaben.
              </p>
            </form>
          </div>
        </div>
      )}

      {/* Walk-in QR-Code Modal */}
      {showQR && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60"
          onClick={(e) => { if (e.target === e.currentTarget) setShowQR(false); }}
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <QrCode className="w-5 h-5 text-violet-600" />
                <h2 className="text-base font-semibold text-gray-900">Walk-in QR-Code</h2>
              </div>
              <button
                onClick={() => setShowQR(false)}
                className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* QR code area */}
            <div className="px-5 py-5 flex flex-col items-center gap-4">
              {qrLoading && (
                <div className="h-64 flex items-center justify-center">
                  <RefreshCw className="w-8 h-8 animate-spin text-violet-500" />
                </div>
              )}
              {qrError && (
                <p className="text-sm text-red-600 bg-red-50 rounded-lg px-4 py-3 w-full text-center">
                  {qrError}
                </p>
              )}
              {qrData && !qrLoading && (
                <>
                  {/* QR code image */}
                  <div className="bg-white p-2 rounded-xl border-2 border-gray-100 shadow-inner">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={qrData.qrCodeDataUrl}
                      alt="Walk-in QR-Code"
                      className="w-64 h-64"
                    />
                  </div>

                  <div className="text-center space-y-1">
                    <p className="text-sm font-semibold text-gray-900">{qrData.eventTitle}</p>
                    <p className="text-xs text-gray-500">
                      Gäste scannen diesen Code um sich vor Ort anzumelden
                    </p>
                  </div>

                  {/* Action buttons */}
                  <div className="flex gap-2 w-full">
                    <button
                      onClick={handleCopyLink}
                      className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 border border-gray-200 hover:bg-gray-50 rounded-xl text-sm text-gray-600 transition-colors"
                    >
                      {copied ? (
                        <>
                          <Check className="w-4 h-4 text-green-600" />
                          <span className="text-green-700">Kopiert!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-4 h-4" />
                          Link kopieren
                        </>
                      )}
                    </button>
                    <a
                      href={qrData.walkInUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 border border-gray-200 hover:bg-gray-50 rounded-xl text-sm text-gray-600 transition-colors"
                    >
                      <ExternalLink className="w-4 h-4" />
                      Öffnen
                    </a>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Person-detail overlay — rendered at page level so data refreshes don't close it */}
      {overlayParticipant && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50"
          onClick={(e) => { if (e.target === e.currentTarget) setOverlayParticipantId(null); }}
        >
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md shadow-xl">
            <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-gray-100">
              <div>
                <p className="text-base font-semibold text-gray-900">
                  {overlayParticipant.first_name} {overlayParticipant.last_name}
                </p>
                <p className="text-xs text-gray-400">
                  {overlayParticipant.email ?? overlayParticipant.phone ?? "–"}
                </p>
              </div>
              <button
                onClick={() => setOverlayParticipantId(null)}
                className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="px-5 py-3 space-y-1.5 max-h-72 overflow-y-auto">
              {(overlayParticipant.persons ?? []).map((person) => {
                const personChecked = person.checked_in_at !== null;
                const personBusy = personLoadingId === person.id;
                return (
                  <div
                    key={person.id}
                    className={`flex items-center justify-between px-3 py-2.5 rounded-xl border transition-colors ${
                      personChecked ? "bg-green-50 border-green-100" : "bg-gray-50 border-gray-100"
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className={`w-2 h-2 rounded-full shrink-0 ${personChecked ? "bg-green-500" : "bg-gray-300"}`} />
                      <span className={`text-sm font-medium truncate ${personChecked ? "text-green-900" : "text-gray-800"}`}>
                        {person.first_name} {person.last_name}
                      </span>
                      {person.is_child && <ChildBadge className="shrink-0" />}
                      {personChecked && (
                        <span className="text-xs text-green-600 shrink-0">{formatTime(person.checked_in_at)}</span>
                      )}
                    </div>
                    <button
                      onClick={() => personChecked ? handlePersonUndo(person.id) : handlePersonCheckin(person.id)}
                      disabled={personBusy}
                      className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors disabled:opacity-50 ${
                        personChecked
                          ? "border-red-200 text-red-600 hover:bg-red-50"
                          : "border-green-200 text-green-700 hover:bg-green-50 bg-white"
                      }`}
                    >
                      {personBusy ? (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      ) : personChecked ? (
                        <><Undo2 className="w-3.5 h-3.5" /> Zurück</>
                      ) : (
                        <><UserCheck className="w-3.5 h-3.5" /> Einchecken</>
                      )}
                    </button>
                  </div>
                );
              })}
            </div>

            <div className="px-5 pb-5 pt-3 flex gap-2 border-t border-gray-100">
              {(overlayParticipant.persons ?? []).some((p) => p.checked_in_at === null) && (
                <button
                  onClick={() => handleManualCheckin(overlayParticipant.id)}
                  disabled={manualCheckinId === overlayParticipant.id}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white rounded-xl text-sm font-semibold transition-colors"
                >
                  {manualCheckinId === overlayParticipant.id ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <UserCheck className="w-4 h-4" />
                  )}
                  Alle einchecken
                </button>
              )}
              <button
                onClick={() => setOverlayParticipantId(null)}
                className="flex-1 py-2.5 border border-gray-200 text-gray-600 hover:bg-gray-50 rounded-xl text-sm font-medium transition-colors"
              >
                Schließen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ParticipantRow({
  participant,
  onManualCheckin,
  onUndo,
  loadingId,
  undoId,
  onPersonCheckin,
  onPersonUndo,
  personLoadingId,
  onOpenOverlay,
  paymentJustArrived = false,
}: {
  participant: CheckinParticipant;
  /** Zahlung kam gerade rein – die Markierung wird kurz betont. */
  paymentJustArrived?: boolean;
  onManualCheckin: (id: number) => void;
  onUndo: (id: number) => void;
  loadingId: number | null;
  undoId: number | null;
  onPersonCheckin: (personId: string) => void;
  onPersonUndo: (personId: string) => void;
  personLoadingId: string | null;
  onOpenOverlay: (id: number) => void;
}) {
  const checked = participant.checked_in_at !== null;
  const loadingCheckin = loadingId === participant.id;
  const loadingUndo = undoId === participant.id;
  const regBusy = loadingCheckin || loadingUndo;

  const persons = participant.persons ?? [];
  const checkedPersons = persons.filter((p) => p.checked_in_at !== null).length;
  const subtitle = participant.email ?? participant.phone ?? "–";

  return (
    <div
      className={`rounded-xl border transition-colors ${
        checked ? "bg-green-50 border-green-100" : "bg-white border-gray-100"
      }`}
    >
      {/* Registration header row */}
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-xs font-semibold ${
              checked ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"
            }`}
          >
            {participant.first_name[0]}{participant.last_name[0]}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate flex items-center gap-1.5">
              {participant.first_name} {participant.last_name}
              {persons.length > 1 && (
                <span className="text-xs text-gray-400">
                  {checkedPersons}/{persons.length}
                </span>
              )}
              {participant.is_walk_in && (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-100 text-blue-700 leading-none">
                  Walk-in
                </span>
              )}
              {/* Nur wenn es stimmt: keine Markierung heißt "noch offen".
                  Bei kostenlosen Events zahlt niemand, dort bleibt die Zeile
                  deshalb unverändert. */}
              {participant.paid_at && (
                <PaidBadge
                  paid
                  className={
                    paymentJustArrived ? "ring-2 ring-green-400 ring-offset-1" : undefined
                  }
                />
              )}
            </p>
            <p className="text-xs text-gray-400 truncate">{subtitle}</p>
            {participant.notes && (
              <p className="text-xs text-gray-400 truncate italic">{participant.notes}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0 ml-3">
          <RegistrationDetailButton registrationId={participant.id} />
          {checked ? (
            <>
              <span className="flex items-center gap-1 text-xs font-medium text-green-700">
                <CheckCircle2 className="w-3.5 h-3.5" />
                {formatTime(participant.checked_in_at)}
              </span>
              <button
                onClick={() => onOpenOverlay(participant.id)}
                title="Personen anzeigen"
                className="flex items-center gap-1 px-2 py-1.5 text-xs border border-gray-200 hover:border-gray-300 hover:bg-gray-50 text-gray-500 rounded-lg transition-colors"
              >
                <List className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => onUndo(participant.id)}
                disabled={regBusy}
                title="Alle rückgängig"
                className="flex items-center gap-1 px-2 py-1.5 text-xs border border-gray-200 hover:border-red-300 hover:bg-red-50 hover:text-red-600 rounded-lg transition-colors disabled:opacity-50"
              >
                {loadingUndo ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Undo2 className="w-3.5 h-3.5" />}
                <span className="hidden sm:inline">Alle zurück</span>
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => onManualCheckin(participant.id)}
                disabled={regBusy}
                title="Alle einchecken"
                className="flex items-center gap-1 px-2.5 py-1.5 text-xs border border-gray-200 hover:border-green-300 hover:bg-green-50 hover:text-green-700 rounded-lg transition-colors disabled:opacity-50"
              >
                {loadingCheckin ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <UserCheck className="w-3.5 h-3.5" />}
                <span className="hidden sm:inline">Alle ein</span>
              </button>
              <button
                onClick={() => onOpenOverlay(participant.id)}
                title="Einzeln einchecken"
                className="flex items-center gap-1 px-2 py-1.5 text-xs border border-gray-200 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-600 text-gray-500 rounded-lg transition-colors"
              >
                <List className="w-3.5 h-3.5" />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Per-person rows (only when multiple persons) */}
      {persons.length > 0 && (
        <div className="border-t border-gray-100 divide-y divide-gray-50">
          {persons.map((person) => {
            const personChecked = person.checked_in_at !== null;
            const personBusy = personLoadingId === person.id;
            return (
              <div
                key={person.id}
                className={`flex items-center justify-between px-4 py-2 ${
                  personChecked ? "bg-green-50/60" : ""
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${personChecked ? "bg-green-500" : "bg-gray-300"}`} />
                  <span className={`text-xs truncate ${personChecked ? "text-green-800" : "text-gray-700"}`}>
                    {person.first_name} {person.last_name}
                  </span>
                  {person.is_child && <ChildBadge className="shrink-0" />}
                  {personChecked && (
                    <span className="text-xs text-green-600 shrink-0">
                      {formatTime(person.checked_in_at)}
                    </span>
                  )}
                </div>
                <button
                  onClick={() =>
                    personChecked ? onPersonUndo(person.id) : onPersonCheckin(person.id)
                  }
                  disabled={personBusy}
                  className={`shrink-0 flex items-center gap-1 px-2 py-1 text-xs rounded-lg border transition-colors disabled:opacity-50 ${
                    personChecked
                      ? "border-gray-200 text-gray-500 hover:border-red-300 hover:text-red-600 hover:bg-red-50"
                      : "border-gray-200 text-gray-600 hover:border-green-300 hover:text-green-700 hover:bg-green-50"
                  }`}
                >
                  {personBusy ? (
                    <RefreshCw className="w-3 h-3 animate-spin" />
                  ) : personChecked ? (
                    <Undo2 className="w-3 h-3" />
                  ) : (
                    <UserCheck className="w-3 h-3" />
                  )}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function formatWaitingSince(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" }) +
    ", " + d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
}

/**
 * One pending registration on the waitlist. Single-person sign-ups get the two
 * top-level actions; for groups every name is listed with its own check-in
 * button so a guest who shows up alone can be let in without their companions.
 */
function WaitlistRow({
  entry,
  position,
  onConfirm,
  onOffer,
  regLoadingId,
  personLoadingId,
}: {
  entry: WaitlistEntry;
  position: number;
  onConfirm: (
    registrationId: number,
    options?: { personIds?: string[]; checkinAll?: boolean }
  ) => void;
  onOffer: (registrationId: number) => void;
  regLoadingId: number | null;
  personLoadingId: string | null;
}) {
  const persons = entry.persons ?? [];
  const multi = persons.length > 1;
  const regBusy = regLoadingId === entry.id;
  const anyBusy = regBusy || persons.some((p) => personLoadingId === p.id);
  const subtitle = entry.email ?? entry.phone ?? "–";

  return (
    <div className="rounded-xl border border-amber-100 bg-white">
      {/* Registration header row */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-4 py-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-xs font-semibold bg-amber-100 text-amber-700">
            {position}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate flex items-center gap-1.5">
              {entry.first_name} {entry.last_name}
              {multi && (
                <span className="text-xs text-gray-400">+{persons.length - 1}</span>
              )}
              {entry.is_waitlist ? (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-700 leading-none">
                  Warteliste
                </span>
              ) : (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-100 text-blue-700 leading-none">
                  Platz angeboten
                </span>
              )}
            </p>
            <p className="text-xs text-gray-400 truncate">{subtitle}</p>
            <p className="text-xs text-gray-400 truncate">
              {persons.length} Person{persons.length !== 1 ? "en" : ""} · seit {formatWaitingSince(entry.created_at)}
            </p>
            {entry.notes && (
              <p className="text-xs text-gray-400 truncate italic">{entry.notes}</p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <RegistrationDetailButton registrationId={entry.id} />
          {entry.is_waitlist && (
            <button
              onClick={() => onOffer(entry.id)}
              disabled={anyBusy}
              title="Platz anbieten – die Anmeldung wird zahlbar und bekommt eine E-Mail"
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium border border-blue-200 hover:border-blue-300 hover:bg-blue-50 text-blue-700 rounded-lg transition-colors disabled:opacity-50"
            >
              {regBusy ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Mail className="w-3.5 h-3.5" />
              )}
              Platz anbieten
            </button>
          )}
          <button
            onClick={() => onConfirm(entry.id)}
            disabled={anyBusy}
            title="Nur bestätigen (ohne Check-In)"
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium border border-gray-200 hover:border-green-300 hover:bg-green-50 hover:text-green-700 text-gray-600 rounded-lg transition-colors disabled:opacity-50"
          >
            {regBusy ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <BadgeCheck className="w-3.5 h-3.5" />}
            Bestätigen
          </button>
          <button
            onClick={() => onConfirm(entry.id, { checkinAll: true })}
            disabled={anyBusy}
            title={multi ? "Alle bestätigen und einchecken" : "Bestätigen und einchecken"}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors disabled:opacity-50"
          >
            <UserCheck className="w-3.5 h-3.5" />
            {multi ? "Alle einchecken" : "Einchecken"}
          </button>
        </div>
      </div>

      {/* Per-person rows (only when multiple persons) */}
      {multi && (
        <div className="border-t border-amber-100 divide-y divide-gray-50">
          {persons.map((person) => {
            const personChecked = person.checked_in_at !== null;
            const personBusy = personLoadingId === person.id;
            return (
              <div key={person.id} className="flex items-center justify-between px-4 py-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${personChecked ? "bg-green-500" : "bg-amber-400"}`} />
                  <span className="text-xs truncate text-gray-700">
                    {person.first_name} {person.last_name}
                  </span>
                  {person.is_child && <ChildBadge className="shrink-0" />}
                </div>
                <button
                  onClick={() => onConfirm(entry.id, { personIds: [person.id] })}
                  disabled={anyBusy}
                  title="Diese Person bestätigen und einchecken"
                  className="shrink-0 flex items-center gap-1 px-2 py-1 text-xs text-gray-600 rounded-lg border border-gray-200 hover:border-green-300 hover:text-green-700 hover:bg-green-50 transition-colors disabled:opacity-50"
                >
                  {personBusy ? (
                    <RefreshCw className="w-3 h-3 animate-spin" />
                  ) : (
                    <UserCheck className="w-3 h-3" />
                  )}
                  Einchecken
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
