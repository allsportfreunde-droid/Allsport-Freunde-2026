"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { X, CheckCircle2, Loader2, MessageSquare } from "lucide-react";
import type { EventWithRegistrations } from "@/lib/types";
import HoneypotFields from "@/components/HoneypotFields";

interface ContactFormModalProps {
  open: boolean;
  onClose: () => void;
  /** If provided, this event is pre-selected in the dropdown */
  eventId?: number | null;
  /** All available events for the dropdown */
  events?: EventWithRegistrations[];
}

type Stage = "form" | "success";

function formatDate(dateStr: string) {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export default function ContactFormModal({
  open,
  onClose,
  eventId,
  events = [],
}: ContactFormModalProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [stage, setStage] = useState<Stage>("form");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conversationToken, setConversationToken] = useState<string | null>(null);

  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    email: "",
    whatsapp_number: "",
    message: "",
    event_id: eventId ?? "",
    consent_to_store: false,
  });

  // Sync eventId prop → form state when it changes
  useEffect(() => {
    setForm((prev) => ({ ...prev, event_id: eventId ?? "" }));
  }, [eventId]);

  // Reset on close
  useEffect(() => {
    if (!open) {
      setTimeout(() => {
        setStage("form");
        setError(null);
        setForm({
          first_name: "",
          last_name: "",
          email: "",
          whatsapp_number: "",
          message: "",
          event_id: eventId ?? "",
          consent_to_store: false,
        });
      }, 300);
    }
  }, [open, eventId]);

  // Body scroll lock
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  // Escape key
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  // Scroll top on open
  useEffect(() => {
    if (open && scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [open]);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value, type } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]:
        type === "checkbox"
          ? (e.target as HTMLInputElement).checked
          : value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!form.email.trim() || !form.message.trim()) {
      setError("E-Mail und Nachricht sind erforderlich.");
      return;
    }

    setLoading(true);
    try {
      if(form.first_name.trim().length > 50) {
        setError("Der Vorname darf maximal 50 Zeichen lang sein.");
        return;
      }

      if(form.last_name.trim().length > 50) {
        setError("Der Nachname darf maximal 50 Zeichen lang sein.");
        return;
      }

      if(form.email.trim().length > 255) {
        setError("Die E-Mail-Adresse darf maximal 255 Zeichen lang sein.");
        return;
      }

      if(form.message.length > 1000) {
        setError("Die Nachricht darf maximal 1000 Zeichen lang sein.");
        return;
      }

      const formEl = e.currentTarget as HTMLFormElement;
      const fd = new FormData(formEl);
      const _hp = (fd.get("_hp") as string | null) ?? "";
      const _ts = (fd.get("_ts") as string | null) ?? "";

      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          first_name: form.first_name.trim() || undefined,
          last_name: form.last_name.trim() || undefined,
          email: form.email.trim(),
          whatsapp_number: form.whatsapp_number.trim() || undefined,
          message: form.message.trim(),
          event_id: form.event_id ? Number(form.event_id) : null,
          consent_to_store: form.consent_to_store,
          _hp,
          _ts,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Ein Fehler ist aufgetreten.");
        return;
      }

      setConversationToken(data.conversationToken);
      setStage("success");
    } catch {
      setError("Verbindungsfehler. Bitte versuche es erneut.");
    } finally {
      setLoading(false);
    }
  };

  const handleNewRequest = () => {
    setStage("form");
    setError(null);
    setConversationToken(null);
    setForm({
      first_name: "",
      last_name: "",
      email: "",
      whatsapp_number: "",
      message: "",
      event_id: eventId ?? "",
      consent_to_store: false,
    });
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            key="modal"
            initial={{ opacity: 0, y: 40, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 40, scale: 0.97 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center sm:p-4"
          >
            <div
              ref={scrollRef}
              className="relative w-full max-w-lg max-h-[95dvh] sm:max-h-[90vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl bg-white shadow-2xl"
            >
              {/* Close button */}
              <button
                onClick={onClose}
                className="absolute top-4 right-4 z-10 flex items-center justify-center w-9 h-9 rounded-full bg-white/80 backdrop-blur-sm shadow-md hover:bg-gray-100 transition-colors"
                aria-label="Schließen"
              >
                <X className="w-5 h-5 text-gray-700" />
              </button>

              <div className="p-6 sm:p-8">
                {stage === "success" ? (
                  <SuccessView
                    conversationToken={conversationToken}
                    onNewRequest={handleNewRequest}
                    onClose={onClose}
                  />
                ) : (
                  <>
                    {/* Header */}
                    <div className="flex items-center gap-3 mb-6">
                      <div className="flex items-center justify-center w-10 h-10 rounded-full bg-navy-50">
                        <MessageSquare className="w-5 h-5 text-navy-700" />
                      </div>
                      <div>
                        <h2 className="text-xl font-bold text-gray-900">Kontakt</h2>
                        <p className="text-sm text-gray-500">Wir antworten innerhalb von 48h</p>
                      </div>
                    </div>

                    {error && (
                      <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                        {error}
                      </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-4">
                      {/* Name row */}
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <Label htmlFor="cf-first_name">Vorname</Label>
                          <Input
                            id="cf-first_name"
                            name="first_name"
                            value={form.first_name}
                            onChange={handleChange}
                            maxLength={50}
                            placeholder="Max"
                            autoComplete="given-name"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor="cf-last_name">Nachname</Label>
                          <Input
                            id="cf-last_name"
                            name="last_name"
                            value={form.last_name}
                            onChange={handleChange}
                            maxLength={50}
                            placeholder="Mustermann"
                            autoComplete="family-name"
                          />
                        </div>
                      </div>

                      {/* Email */}
                      <div className="space-y-1.5">
                        <Label htmlFor="cf-email">
                          E-Mail <span className="text-red-500">*</span>
                        </Label>
                        <Input
                          id="cf-email"
                          name="email"
                          type="email"
                          required
                          value={form.email}
                          onChange={handleChange}
                          maxLength={254}
                          placeholder="max@beispiel.de"
                          autoComplete="email"
                        />
                      </div>

                      {/* WhatsApp */}
                      <div className="space-y-1.5">
                        <Label htmlFor="cf-whatsapp">
                          WhatsApp-Nummer{" "}
                          <span className="text-gray-400 text-xs font-normal">(optional)</span>
                        </Label>
                        <Input
                          id="cf-whatsapp"
                          name="whatsapp_number"
                          type="tel"
                          value={form.whatsapp_number}
                          onChange={handleChange}
                          maxLength={20}
                          placeholder="+49 170 1234567"
                          autoComplete="tel"
                        />
                      </div>

                      {/* Event dropdown */}
                      {events.length > 0 && (
                        <div className="space-y-1.5">
                          <Label htmlFor="cf-event">Veranstaltung</Label>
                          <select
                            id="cf-event"
                            name="event_id"
                            value={form.event_id}
                            onChange={handleChange}
                            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                          >
                            <option value="">Keine Veranstaltung</option>
                            {events.map((ev) => (
                              <option key={ev.id} value={ev.id}>
                                {ev.title} ({formatDate(ev.date)})
                              </option>
                            ))}
                          </select>
                        </div>
                      )}

                      {/* Message */}
                      <div className="space-y-1.5">
                        <Label htmlFor="cf-message">
                          Nachricht <span className="text-red-500">*</span>
                        </Label>
                        <Textarea
                          id="cf-message"
                          name="message"
                          required
                          value={form.message}
                          onChange={handleChange}
                          placeholder="Deine Frage oder Nachricht..."
                          rows={4}
                          maxLength={2000}
                          className="resize-none"
                        />
                        <div className="text-right text-xs text-gray-500">
                          {form.message.length} / 2000 Zeichen
                        </div>
                      </div>

                      {/* DSGVO consent */}
                      <label className="flex items-start gap-2.5 cursor-pointer">
                        <input
                          type="checkbox"
                          name="consent_to_store"
                          checked={form.consent_to_store}
                          onChange={handleChange}
                          className="mt-0.5 h-4 w-4 rounded border-gray-300 accent-navy-700"
                        />
                        <span className="text-xs text-gray-500 leading-relaxed">
                          Ich willige ein, dass meine Kontaktdaten über 90 Tage hinaus gespeichert
                          werden dürfen (freiwillig, ohne Auswirkung auf deine Anfrage).
                        </span>
                      </label>

                      <HoneypotFields />

                      <Button
                        type="submit"
                        disabled={loading}
                        className="w-full h-11"
                      >
                        {loading ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Wird gesendet…
                          </>
                        ) : (
                          "Nachricht senden"
                        )}
                      </Button>
                    </form>
                  </>
                )}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function SuccessView({
  conversationToken,
  onNewRequest,
  onClose,
}: {
  conversationToken: string | null;
  onNewRequest: () => void;
  onClose: () => void;
}) {
  return (
    <div className="text-center py-4 space-y-5">
      <div className="flex justify-center">
        <CheckCircle2 className="w-16 h-16 text-green-500" />
      </div>
      <div>
        <h3 className="text-xl font-bold text-gray-900 mb-2">
          Nachricht gesendet!
        </h3>
        <p className="text-gray-600 text-sm leading-relaxed">
          Deine Anfrage ist eingegangen. Wir antworten dir innerhalb von{" "}
          <strong>48 Stunden</strong>. Du erhältst eine Bestätigungs-E-Mail.
        </p>
      </div>

      {conversationToken && (
        <a
          href={`/conversation/${conversationToken}`}
          className="inline-flex items-center gap-1.5 text-sm text-navy-700 hover:text-navy-500 underline underline-offset-2"
        >
          Anfrage verfolgen
        </a>
      )}

      <div className="flex flex-col gap-2 pt-2">
        <Button onClick={onClose} className="w-full">
          Schließen
        </Button>
        <Button
          variant="ghost"
          className="w-full text-sm text-gray-500"
          onClick={onNewRequest}
        >
          Weitere Anfrage schreiben
        </Button>
      </div>
    </div>
  );
}
