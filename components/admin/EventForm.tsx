"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { Loader2, Globe, EyeOff, LayoutTemplate, Plus, Trash2, GripVertical, AlertCircle, CheckCircle2, Euro } from "lucide-react";
import { Reorder } from "framer-motion";
import type { EventWithRegistrations, EventCreateInput, EventTemplate, EventImageInput, EventCost } from "@/lib/types";
import { formatEuro } from "@/lib/finance";
import { AmountInput } from "@/components/ui/AmountInput";
import {
  FREE_PRICE_LABEL,
  amountFromCents,
  centsFromAmount,
  parsePriceText,
  priceFromAmount,
  type PriceFields,
} from "@/lib/price";

interface EventFormProps {
  event?: EventWithRegistrations;
}

interface ImageEntry {
  _key: string;
  url: string;
  alt_text: string;
  /** null = not validated yet, true = valid image URL, false = invalid */
  valid: boolean | null;
}

function validateImageUrl(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      resolve(false);
      return;
    }
    const img = new window.Image();
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    img.src = url;
    // Timeout after 5s
    setTimeout(() => resolve(false), 5000);
  });
}

/**
 * Eingabemodus für den Preis. Alle drei münden in dieselben zwei DB-Felder,
 * siehe lib/price.ts.
 */
type PriceMode = "amount" | "stripe" | "text";

/** Leitet den passenden Eingabemodus aus einem bestehenden Datensatz ab. */
function derivePriceState(
  source?: { price?: string; entry_price?: number | null; stripe_price_id?: string | null } | null
): { mode: PriceMode; cents: number; text: string; stripeId: string } {
  const text = (source?.price ?? "").trim();
  const amount = source?.entry_price ?? null;
  const textAmount = text ? parsePriceText(text) : null;
  const stripeId = source?.stripe_price_id ?? "";

  // Eine hinterlegte Price ID bedeutet: der Betrag kam aus Stripe
  if (stripeId) {
    return { mode: "stripe", cents: centsFromAmount(amount ?? textAmount), text: "", stripeId };
  }
  // Kein Text, ein reiner Betrag oder schlicht "Kostenlos" → Betragsmodus
  if (!text || textAmount != null || (text === FREE_PRICE_LABEL && amount == null)) {
    return { mode: "amount", cents: centsFromAmount(amount ?? textAmount), text: "", stripeId: "" };
  }
  // Echter Freitext – der Betrag bleibt als Berechnungsgrundlage erhalten
  return { mode: "text", cents: centsFromAmount(amount), text, stripeId: "" };
}

/** Baut die beiden DB-Felder aus dem aktuellen Eingabezustand. */
function priceFieldsFor(mode: PriceMode, cents: number, text: string): PriceFields {
  if (mode === "text") {
    const trimmed = text.trim();
    if (trimmed) {
      return { price: trimmed, entry_price: cents > 0 ? amountFromCents(cents) : null };
    }
  }
  return priceFromAmount(amountFromCents(cents));
}

export default function EventForm({ event }: EventFormProps) {
  const router = useRouter();
  const { toast } = useToast();
  const isEdit = !!event;
  const isDraft = !isEdit || event.status === "draft";

  // Preis bewusst NICHT in formData – er hat unten seinen eigenen Zustand,
  // damit es im Formular keine zweite Quelle der Wahrheit gibt.
  const [formData, setFormData] = useState<Omit<EventCreateInput, "price" | "entry_price">>({
    title: event?.title ?? "",
    category: event?.category ?? "fussball",
    description: event?.description ?? "",
    date: event?.date?.split("T")[0] ?? "",
    time: event?.time ?? "",
    location: event?.location ?? "",
    parking_location: event?.parking_location ?? "",
    dress_code: event?.dress_code ?? "",
    max_participants: event?.max_participants ?? 20,
    max_per_email: event?.max_per_email ?? 5,
    survey_url: event?.survey_url ?? null,
    cancellation_deadline: event?.cancellation_deadline ?? null,
  });
  const [submitting, setSubmitting] = useState(false);
  const [publishConfirmOpen, setPublishConfirmOpen] = useState(false);
  const initialPrice = derivePriceState(event);
  // Beim Anlegen ist Stripe der vorgesehene Weg; beim Bearbeiten richtet sich
  // der Modus nach dem, was gespeichert ist.
  const [priceMode, setPriceMode] = useState<PriceMode>(isEdit ? initialPrice.mode : "stripe");
  const [priceCents, setPriceCents] = useState(initialPrice.cents);
  const [priceText, setPriceText] = useState(initialPrice.text);
  const [stripePriceId, setStripePriceId] = useState(initialPrice.stripeId);
  // Nur eine erfolgreich geladene ID darf gespeichert werden – eine bloß
  // getippte sagt nichts darüber aus, ob sie zum Betrag passt.
  const [loadedStripePriceId, setLoadedStripePriceId] = useState(initialPrice.stripeId);
  const [stripePriceLoading, setStripePriceLoading] = useState(false);
  const [stripePriceError, setStripePriceError] = useState<string | null>(null);
  const [childStripePriceId, setChildStripePriceId] = useState(event?.stripe_child_price_id ?? "");
  const [childPrice, setChildPrice] = useState<{ id: string; amount: number } | null>(
    event?.stripe_child_price_id && event.child_entry_price != null
      ? { id: event.stripe_child_price_id, amount: event.child_entry_price }
      : null
  );
  const [childPriceLoading, setChildPriceLoading] = useState(false);
  const [childPriceError, setChildPriceError] = useState<string | null>(null);
  const [childPriceMode, setChildPriceMode] = useState<PriceMode>(
    event?.stripe_child_price_id ? "stripe" : event?.child_price ? "text" : event?.child_entry_price != null ? "amount" : "stripe"
  );
  const [childPriceCents, setChildPriceCents] = useState(centsFromAmount(event?.child_entry_price));
  const [childPriceText, setChildPriceText] = useState(event?.child_price ?? "");
  const childPriceReady = childPriceMode !== "stripe" || (!childPriceLoading && (
    !childStripePriceId.trim() || childPrice?.id === childStripePriceId.trim()
  ));

  async function loadChildStripePrice() {
    const id = childStripePriceId.trim();
    if (!id || childPriceLoading) return;
    setChildPriceLoading(true);
    setChildPriceError(null);
    setChildPrice(null);
    try {
      const res = await fetch(`/api/admin/stripe/price?kind=child&id=${encodeURIComponent(id)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Kinderpreis konnte nicht geladen werden.");
      setChildPrice({ id: data.stripe_price_id, amount: data.unit_amount / 100 });
      setChildPriceCents(data.unit_amount);
    } catch (error) {
      setChildPriceError(error instanceof Error ? error.message : "Kinderpreis konnte nicht geladen werden.");
    } finally {
      setChildPriceLoading(false);
    }
  }

  const loadStripePrice = useCallback(async (priceId: string) => {
    if (!priceId.trim()) {
      setStripePriceError(null);
      return;
    }
    setStripePriceLoading(true);
    setStripePriceError(null);
    try {
      const res = await fetch(`/api/admin/stripe/price?id=${encodeURIComponent(priceId.trim())}`);
      const data = await res.json();
      if (!res.ok) {
        setStripePriceError(data.error || "Preis konnte nicht geladen werden.");
        setLoadedStripePriceId("");
        return;
      }
      // unit_amount ist Stripes Cent-Betrag – exakt unser internes Format
      setPriceCents(data.unit_amount);
      setLoadedStripePriceId(data.stripe_price_id);
    } catch {
      setStripePriceError("Verbindungsfehler beim Laden des Preises.");
      setLoadedStripePriceId("");
    } finally {
      setStripePriceLoading(false);
    }
  }, []);

  // Was am Ende in die DB geht – aus genau einer Quelle abgeleitet.
  const priceFields = priceFieldsFor(priceMode, priceCents, priceText);
  // Die ID gilt nur im Stripe-Modus; wer den Modus wechselt, verwirft sie.
  const stripePriceIdToSave =
    priceMode === "stripe" && priceFields.entry_price != null ? loadedStripePriceId : null;

  // ── Costs state (edit mode only, deferred save) ───────
  interface LocalCost { _key: string; id?: number; description: string; amount: number; }
  const [costs, setCosts] = useState<LocalCost[]>([]);
  const [costsLoading, setCostsLoading] = useState(false);
  const savedCostsRef = useRef<LocalCost[]>([]);
  // editing an existing cost row
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editDesc, setEditDesc] = useState("");
  const [editAmount, setEditAmount] = useState("");
  // new cost row
  const [newDesc, setNewDesc] = useState("");
  const [newAmount, setNewAmount] = useState("");

  useEffect(() => {
    if (!isEdit || !event?.id) return;
    setCostsLoading(true);
    fetch(`/api/admin/events/${event.id}/costs`)
      .then((r) => r.json())
      .then((data: EventCost[]) => {
        if (!Array.isArray(data)) return;
        const loaded: LocalCost[] = data.map((c) => ({ _key: String(c.id), id: c.id, description: c.description, amount: c.amount }));
        setCosts(loaded);
        savedCostsRef.current = loaded;
      })
      .catch(() => {})
      .finally(() => setCostsLoading(false));
  }, [isEdit, event?.id]);

  const totalCosts = costs.reduce((s, c) => s + c.amount, 0);

  function handleAddCost() {
    if (!newDesc.trim() || !newAmount.trim()) return;
    const amount = parseFloat(newAmount.replace(",", "."));
    if (isNaN(amount) || amount <= 0) { toast("Ungültiger Betrag.", "error"); return; }
    setCosts((prev) => [...prev, { _key: crypto.randomUUID(), description: newDesc.trim(), amount }]);
    setNewDesc("");
    setNewAmount("");
  }

  function startEditCost(cost: LocalCost) {
    setEditingKey(cost._key);
    setEditDesc(cost.description);
    setEditAmount(String(cost.amount));
  }

  function saveEditCost(key: string) {
    const amount = parseFloat(editAmount.replace(",", "."));
    if (!editDesc.trim() || isNaN(amount) || amount <= 0) { toast("Ungültige Eingabe.", "error"); return; }
    setCosts((prev) => prev.map((c) => (c._key === key ? { ...c, description: editDesc.trim(), amount } : c)));
    setEditingKey(null);
  }

  function handleDeleteCost(key: string) {
    setCosts((prev) => prev.filter((c) => c._key !== key));
  }

  async function syncCosts(eventId: number) {
    const saved = savedCostsRef.current;
    const savedIds = new Set(saved.map((c) => c.id).filter(Boolean) as number[]);
    const currentIds = new Set(costs.map((c) => c.id).filter(Boolean) as number[]);
    // Delete removed
    for (const id of savedIds) {
      if (!currentIds.has(id)) {
        await fetch(`/api/admin/events/${eventId}/costs/${id}`, { method: "DELETE" }).catch(() => {});
      }
    }
    // Update changed
    for (const c of costs.filter((c) => c.id)) {
      const orig = saved.find((s) => s.id === c.id);
      if (orig && (orig.description !== c.description || orig.amount !== c.amount)) {
        await fetch(`/api/admin/events/${eventId}/costs/${c.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ description: c.description, amount: c.amount }),
        }).catch(() => {});
      }
    }
    // Create new
    for (const c of costs.filter((c) => !c.id)) {
      await fetch(`/api/admin/events/${eventId}/costs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: c.description, amount: c.amount }),
      }).catch(() => {});
    }
    savedCostsRef.current = costs;
  }

  // Image management
  const [images, setImages] = useState<ImageEntry[]>(() =>
    (event?.images ?? []).map((img) => ({
      _key: String(img.id),
      url: img.url,
      alt_text: img.alt_text,
      valid: true,
    }))
  );

  const addImage = () => {
    setImages((prev) => [...prev, { _key: crypto.randomUUID(), url: "", alt_text: "", valid: null }]);
  };

  const removeImage = (key: string) => {
    setImages((prev) => prev.filter((i) => i._key !== key));
  };

  const updateImage = (key: string, field: "url" | "alt_text", value: string) => {
    setImages((prev) =>
      prev.map((i) => (i._key === key ? { ...i, [field]: value, valid: field === "url" ? null : i.valid } : i))
    );
  };

  const validateImage = useCallback(async (key: string, url: string) => {
    if (!url.trim()) {
      setImages((prev) => prev.map((i) => (i._key === key ? { ...i, valid: null } : i)));
      return;
    }
    const ok = await validateImageUrl(url);
    setImages((prev) => prev.map((i) => (i._key === key ? { ...i, valid: ok } : i)));
  }, []);

  // Template selector
  const [templates, setTemplates] = useState<EventTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");

  // Save-as-template dialog
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [savingTemplate, setSavingTemplate] = useState(false);

  useEffect(() => {
    fetch("/api/admin/templates")
      .then((r) => r.json())
      .then((data) => { if (Array.isArray(data)) setTemplates(data); })
      .catch(() => { /* templates are optional, silently ignore */ });
  }, []);

  const applyTemplate = (id: string) => {
    const tpl = templates.find((t) => String(t.id) === id);
    if (!tpl) return;
    setFormData((prev) => ({
      ...prev,
      title: tpl.title,
      category: tpl.category,
      description: tpl.description,
      location: tpl.location,
      dress_code: tpl.dress_code,
      max_participants: tpl.max_participants,
      max_per_email: tpl.max_per_email ?? 5,
    }));
    const tplPrice = derivePriceState(tpl);
    setPriceCents(tplPrice.cents);
    setPriceText(tplPrice.text);
    // Der Modus bleibt bewusst auf Stripe: Vorlagen gibt es nur beim Anlegen,
    // und dort soll die Price ID immer der vorgesehene Weg sein.

    // Pre-fill images from template
    setImages(
      (tpl.images ?? []).map((img) => ({
        _key: crypto.randomUUID(),
        url: img.url,
        alt_text: img.alt_text,
        valid: true,
      }))
    );
    setSelectedTemplateId(id);
    // Record last usage
    fetch(`/api/admin/templates/${tpl.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "touch" }),
    }).catch(() => {});
  };

  const handleSubmit = async (e: React.FormEvent, publish: boolean) => {
    e.preventDefault();
    if (!childPriceReady) {
      toast("Bitte den Kinderpreis zuerst laden oder die Kinder-Preis-ID leeren.", "error");
      return;
    }
    setSubmitting(true);

    try {
      const url = isEdit ? `/api/admin/events/${event.id}` : "/api/admin/events";
      const method = isEdit ? "PUT" : "POST";

      const imagePayload: EventImageInput[] = images
        .filter((i) => i.url.trim())
        .map((i, idx) => ({ url: i.url.trim(), alt_text: i.alt_text.trim(), position: idx }));

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          ...priceFields,
          stripe_price_id: stripePriceIdToSave,
          stripe_child_price_id: childPriceMode === "stripe" ? childStripePriceId.trim() || null : null,
          child_entry_price: childPriceMode === "stripe" ? null : amountFromCents(childPriceCents),
          child_price: childPriceMode === "text" ? childPriceText.trim() || null : null,
          images: imagePayload,
          publish,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        toast(data.error || "Fehler beim Speichern.", "error");
        return;
      }

      // Sync deferred cost edits when saving an existing event
      if (isEdit && event?.id) {
        await syncCosts(event.id);
      }

      // After creating a new event from a template, apply template cost positions
      if (!isEdit && data.id && selectedTemplateId) {
        const tpl = templates.find((t) => String(t.id) === selectedTemplateId);
        const tplCosts = tpl?.template_costs ?? [];
        for (const c of tplCosts) {
          await fetch(`/api/admin/events/${data.id}/costs`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ description: c.description, amount: c.amount }),
          }).catch(() => {});
        }
      }

      // If editing a draft and publishing was requested, call the publish endpoint
      if (isEdit && publish && event.status === "draft") {
        const pubRes = await fetch(`/api/admin/events/${event.id}/publish`, { method: "POST" });
        if (!pubRes.ok) {
          const pubData = await pubRes.json();
          toast(pubData.error || "Gespeichert, aber Veröffentlichung fehlgeschlagen.", "error");
          router.push("/admin/events");
          router.refresh();
          return;
        }
      }

      if (publish) {
        toast(isEdit ? "Event gespeichert und veröffentlicht!" : "Event erstellt und veröffentlicht!", "success");
      } else {
        toast(isEdit ? "Event gespeichert." : "Event als Entwurf gespeichert.", "success");
      }
      router.push("/admin/events");
      router.refresh();
    } catch {
      toast("Verbindungsfehler.", "error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveTemplate = async () => {
    if (!templateName.trim()) return;
    setSavingTemplate(true);
    try {
      const res = await fetch("/api/admin/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: templateName.trim(),
          title: formData.title,
          category: formData.category,
          description: formData.description,
          location: formData.location,
          price: priceFields.price,
          entry_price: priceFields.entry_price,
          dress_code: formData.dress_code,
          max_participants: formData.max_participants,
          template_costs: costs.map((c) => ({ description: c.description, amount: c.amount })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast(data.error || "Fehler beim Speichern der Vorlage.", "error");
        return;
      }
      toast(`Vorlage "${templateName.trim()}" gespeichert!`, "success");
      setSaveTemplateOpen(false);
      setTemplateName("");
      // Refresh template list so newly created template appears in dropdown
      fetch("/api/admin/templates")
        .then((r) => r.json())
        .then((data) => { if (Array.isArray(data)) setTemplates(data); })
        .catch(() => {});
    } catch {
      toast("Verbindungsfehler.", "error");
    } finally {
      setSavingTemplate(false);
    }
  };

  const update = (field: keyof EventCreateInput, value: string | number | null) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <div className="space-y-4 pb-24">
      {/* Draft banner */}
      {isDraft && isEdit && (
        <div className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-amber-800">
          <EyeOff className="w-5 h-5 shrink-0" />
          <p className="text-sm font-medium">
            Dieses Event ist noch nicht veröffentlicht und für die Öffentlichkeit unsichtbar.
          </p>
        </div>
      )}

      {/* Template selector – only for new events */}
      {!isEdit && templates.length > 0 && (
        <Card className="border-dashed">
          <CardContent className="pt-5">
            <div className="flex items-center gap-3">
              <LayoutTemplate className="w-5 h-5 text-muted-foreground shrink-0" />
              <div className="flex-1 flex flex-col sm:flex-row gap-2 items-start sm:items-center">
                <Label htmlFor="template-select" className="shrink-0 text-sm">
                  Aus Vorlage erstellen:
                </Label>
                <Select
                  id="template-select"
                  value={selectedTemplateId}
                  onChange={(e) => applyTemplate(e.target.value)}
                  className="flex-1"
                >
                  <option value="">– Vorlage wählen –</option>
                  {templates.map((t) => (
                    <option key={t.id} value={String(t.id)}>
                      {t.name}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
            {selectedTemplateId && (
              <p className="text-xs text-muted-foreground mt-2 ml-8">
                Felder wurden aus der Vorlage vorausgefüllt. Alle Angaben können bearbeitet werden.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{isEdit ? "Event bearbeiten" : "Neues Event erstellen"}</CardTitle>
        </CardHeader>
        <CardContent>
          <form id="event-form" onSubmit={(e) => handleSubmit(e, false)} className="space-y-6 pb-2">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="title">Titel *</Label>
                <Input
                  id="title"
                  required
                  value={formData.title}
                  onChange={(e) => update("title", e.target.value)}
                  placeholder="z.B. Fußball-Turnier im Park"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="category">Kategorie *</Label>
                <Select
                  id="category"
                  required
                  value={formData.category}
                  onChange={(e) => update("category", e.target.value as EventCreateInput["category"])}
                >
                  <option value="fussball">Fußball</option>
                  <option value="fitness">Fitness</option>
                  <option value="schwimmen">Schwimmen</option>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="date">Datum *</Label>
                <Input
                  id="date"
                  type="date"
                  required
                  value={formData.date}
                  onChange={(e) => update("date", e.target.value)}
                  min={new Date().toISOString().split("T")[0]}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="time">Uhrzeit *</Label>
                <Input
                  id="time"
                  type="time"
                  required
                  value={formData.time}
                  onChange={(e) => update("time", e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="location">Ort / Adresse *</Label>
                <Input
                  id="location"
                  required
                  value={formData.location}
                  onChange={(e) => update("location", e.target.value)}
                  placeholder="z.B. Sportplatz Musterstraße 12, Frankfurt"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="parking_location">Parkplatz-Adresse</Label>
                <Input
                  id="parking_location"
                  value={formData.parking_location ?? ""}
                  onChange={(e) => update("parking_location", e.target.value)}
                  placeholder="z.B. Parkplatz Musterstraße, Frankfurt (optional)"
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="price_amount">Preis Erwachsene *</Label>
                  <div className="inline-flex rounded-md border p-0.5 text-xs">
                    {([
                      ["stripe", "Stripe"],
                      ["amount", "Betrag"],
                      ["text", "Freitext"],
                    ] as const).map(([mode, label]) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => setPriceMode(mode)}
                        className={`px-2 py-1 rounded ${priceMode === mode ? "bg-gray-900 text-white" : "text-muted-foreground"}`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {priceMode === "stripe" && (
                  <div className="flex gap-2">
                    <Input
                      value={stripePriceId}
                      onChange={(e) => setStripePriceId(e.target.value)}
                      onBlur={() => loadStripePrice(stripePriceId)}
                      placeholder="price_1AbCdEfGhIjKlMnO"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      disabled={stripePriceLoading || !stripePriceId.trim()}
                      onClick={() => loadStripePrice(stripePriceId)}
                    >
                      {stripePriceLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Laden"}
                    </Button>
                  </div>
                )}
                {stripePriceError && <p className="text-xs text-red-600">{stripePriceError}</p>}

                {priceMode === "text" && (
                  <Input
                    id="price_text"
                    value={priceText}
                    onChange={(e) => setPriceText(e.target.value)}
                    placeholder='z.B. "Spende willkommen"'
                  />
                )}

                {priceMode === "text" && (
                  <Label htmlFor="price_amount" className="text-xs font-normal text-muted-foreground">
                    Berechnungsgrundlage pro Person (optional)
                  </Label>
                )}
                <AmountInput
                  id="price_amount"
                  value={priceCents}
                  onChange={setPriceCents}
                  disabled={priceMode === "stripe"}
                  aria-describedby="price_preview"
                />

                <p id="price_preview" className="text-xs text-muted-foreground">
                  {priceMode === "amount" && <>Ziffern rücken von rechts nach – 500 ergibt 5,00 €.{" "}</>}
                  Teilnehmer sehen:{" "}
                  <span className="font-medium text-foreground">{priceFields.price}</span>
                  {priceFields.entry_price == null ? (
                    <> · keine Umsatzberechnung</>
                  ) : priceFields.price !== formatEuro(priceFields.entry_price) ? (
                    <> · gerechnet wird mit {formatEuro(priceFields.entry_price)}</>
                  ) : null}
                </p>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="child_price_amount">Preis Kinder</Label>
                  <div className="inline-flex rounded-md border p-0.5 text-xs">
                    {([
                      ["stripe", "Stripe"],
                      ["amount", "Betrag"],
                      ["text", "Freitext"],
                    ] as const).map(([mode, label]) => (
                      <button
                        key={mode}
                        type="button"
                        disabled={childPriceLoading || submitting}
                        onClick={() => setChildPriceMode(mode)}
                        className={`px-2 py-1 rounded ${childPriceMode === mode ? "bg-gray-900 text-white" : "text-muted-foreground"}`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                {childPriceMode === "stripe" && <div className="flex gap-2">
                  <Input
                    id="child_stripe_price_id"
                    aria-label="Stripe-Preis-ID für Kinder"
                    value={childStripePriceId}
                    disabled={childPriceLoading || submitting}
                    onChange={(e) => {
                      setChildStripePriceId(e.target.value);
                      setChildPrice(null);
                      setChildPriceError(null);
                    }}
                    placeholder="price_1AbCdEfGhIjKlMnO"
                    aria-describedby="child_price_preview"
                    aria-invalid={!!childPriceError}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    disabled={childPriceLoading || submitting || !childStripePriceId.trim()}
                    onClick={loadChildStripePrice}
                  >
                    {childPriceLoading ? <Loader2 className="w-4 h-4 animate-spin" aria-label="Kinderpreis wird geladen" /> : "Laden"}
                  </Button>
                </div>}
                {childPriceMode === "stripe" && childPriceError && <p className="text-xs text-red-600">{childPriceError}</p>}
                {childPriceMode === "text" && (
                  <>
                    <Input
                      id="child_price_text"
                      aria-label="Kinderpreis als Freitext"
                      value={childPriceText}
                      onChange={(e) => setChildPriceText(e.target.value)}
                      maxLength={100}
                      placeholder='z.B. "Kinderbeitrag"'
                    />
                    <Label htmlFor="child_price_amount" className="text-xs font-normal text-muted-foreground">
                      Fester Betrag pro Kind für den Checkout
                    </Label>
                  </>
                )}
                <AmountInput
                  id="child_price_amount"
                  value={childPriceMode === "stripe"
                    ? centsFromAmount(childPrice?.amount ?? (!childStripePriceId.trim() ? priceFields.entry_price : null))
                    : childPriceCents}
                  onChange={setChildPriceCents}
                  disabled={childPriceMode === "stripe"}
                  aria-describedby="child_price_preview"
                />
                <div id="child_price_preview" className="text-xs" aria-live="polite">
                  {childPriceMode !== "stripe" ? (
                    <p className="text-muted-foreground">
                      Teilnehmer sehen:{" "}
                      <span className="font-medium text-foreground">
                        {childPriceMode === "text" && childPriceText.trim() && parsePriceText(childPriceText) == null
                          ? `${childPriceText.trim()} (${formatEuro(amountFromCents(childPriceCents))})`
                          : formatEuro(amountFromCents(childPriceCents))}
                      </span>
                      {childPriceCents === 0 ? " · kostenlos" : " pro Kind"}
                    </p>
                  ) : childPrice ? (
                    <p className="font-medium">Kinder: {formatEuro(childPrice.amount)}{childPrice.amount === 0 ? " · kostenlos" : " pro Person"}</p>
                  ) : childStripePriceId.trim() ? (
                    <p className="text-muted-foreground">{childPriceLoading ? "Kinderpreis wird geladen …" : "Bitte den Kinderpreis vor dem Speichern laden."}</p>
                  ) : (
                    <p className="text-muted-foreground">Ohne Kinder-Preis-ID gilt der Erwachsenenpreis.</p>
                  )}
                  {childPriceMode === "stripe" && <p className="text-muted-foreground mt-1">Für kostenlose Kinder eine Stripe-Preis-ID mit 0 € hinterlegen.</p>}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="dress_code">Kleiderordnung</Label>
                <Input
                  id="dress_code"
                  value={formData.dress_code}
                  onChange={(e) => update("dress_code", e.target.value)}
                  placeholder="z.B. Sportkleidung & Hallenschuhe"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="max_participants">Max. Teilnehmer *</Label>
                <Input
                  id="max_participants"
                  type="number"
                  required
                  min={1}
                  value={formData.max_participants}
                  onChange={(e) => update("max_participants", parseInt(e.target.value) || 1)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="cancellation_deadline">Stornofrist</Label>
                <Input
                  id="cancellation_deadline"
                  type="datetime-local"
                  // Nach dem Beginn nimmt die Regel die Frist ohnehin nicht an
                  // – der Browser soll das gleich sagen, nicht erst der Server.
                  max={
                    formData.date && formData.time
                      ? `${formData.date}T${formData.time}`
                      : undefined
                  }
                  value={formData.cancellation_deadline ?? ""}
                  onChange={(e) =>
                    update("cancellation_deadline", e.target.value || null)
                  }
                />
                <p className="text-xs text-muted-foreground">
                  Bis wann darf storniert werden? Muss vor dem Beginn liegen.
                  Leer lassen für den Standard: 24 Stunden vor Beginn.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="max_per_email">Max. Personen pro E-Mail</Label>
                <Input
                  id="max_per_email"
                  type="number"
                  min={1}
                  max={20}
                  value={formData.max_per_email ?? 5}
                  onChange={(e) => update("max_per_email", parseInt(e.target.value) || 5)}
                />
                <p className="text-xs text-muted-foreground">Wie viele Personen darf eine E-Mail-Adresse anmelden? (Standard: 5)</p>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="survey_url">Feedback-Umfrage URL <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Input
                id="survey_url"
                type="url"
                value={formData.survey_url ?? ""}
                onChange={(e) => update("survey_url", e.target.value.trim() || null)}
                placeholder="https://umfrage.example.com/feedback"
              />
              <p className="text-xs text-muted-foreground">
                Wenn hinterlegt, wird 1 Tag nach dem Event automatisch eine Feedback-E-Mail an alle bestätigten Teilnehmer gesendet.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Beschreibung</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => update("description", e.target.value)}
                placeholder="Freitext für Details zum Event..."
                rows={4}
              />
            </div>

          </form>
        </CardContent>
      </Card>

      {/* ── Kostenpositionen (nur beim Bearbeiten) ───────── */}
      {isEdit && event?.id && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Euro className="w-5 h-5 text-muted-foreground" />
              Kostenpositionen
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {costsLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                <Loader2 className="w-4 h-4 animate-spin" /> Laden...
              </div>
            ) : (
              <>
                {/* Existing cost rows */}
                {costs.length > 0 ? (
                  <div className="space-y-2">
                    {costs.map((cost) =>
                      editingKey === cost._key ? (
                        <div key={cost._key} className="flex gap-2 items-center bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
                          <Input
                            value={editDesc}
                            onChange={(e) => setEditDesc(e.target.value)}
                            className="flex-1 h-8 text-sm"
                            placeholder="Beschreibung"
                            autoFocus
                          />
                          <div className="relative w-32 shrink-0">
                            <Euro className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                            <Input
                              value={editAmount}
                              onChange={(e) => setEditAmount(e.target.value)}
                              className="pl-7 h-8 text-sm"
                              placeholder="0.00"
                            />
                          </div>
                          <Button size="sm" variant="outline" className="h-8 px-2" onClick={() => saveEditCost(cost._key)}>
                            <CheckCircle2 className="w-4 h-4 text-green-600" />
                          </Button>
                          <Button size="sm" variant="ghost" className="h-8 px-2" onClick={() => setEditingKey(null)}>
                            <AlertCircle className="w-4 h-4 text-gray-400" />
                          </Button>
                        </div>
                      ) : (
                        <div
                          key={cost._key}
                          className="flex gap-2 items-center border rounded-lg px-3 py-2 hover:bg-gray-50 cursor-pointer group"
                          onClick={() => startEditCost(cost)}
                          title="Klicken zum Bearbeiten"
                        >
                          <span className="flex-1 text-sm text-gray-800">{cost.description}</span>
                          <span className="text-sm font-medium text-gray-700 shrink-0">
                            {formatEuro(cost.amount)}
                          </span>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 px-2 opacity-0 group-hover:opacity-100 text-red-500 hover:text-red-700 hover:bg-red-50"
                            onClick={(e) => { e.stopPropagation(); handleDeleteCost(cost._key); }}
                            title="Löschen"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      )
                    )}
                    <div className="flex justify-between items-center px-3 pt-1 border-t">
                      <span className="text-sm font-semibold text-gray-700">Gesamtkosten</span>
                      <span className="text-base font-bold text-gray-900">{formatEuro(totalCosts)}</span>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground py-1">
                    Noch keine Kostenpositionen. Füge Positionen wie Hallenmiete, Schiedsrichter oder Material hinzu.
                  </p>
                )}

                {/* Add new cost row */}
                <div className="flex gap-2 items-end pt-2 border-t">
                  <div className="flex-1 space-y-1">
                    <Label className="text-xs">Neue Position</Label>
                    <Input
                      value={newDesc}
                      onChange={(e) => setNewDesc(e.target.value)}
                      placeholder='z.B. "Hallenmiete", "Schiedsrichter"'
                      className="h-9 text-sm"
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAddCost(); } }}
                    />
                  </div>
                  <div className="w-32 shrink-0 space-y-1">
                    <Label className="text-xs">Betrag (€)</Label>
                    <div className="relative">
                      <Euro className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                      <Input
                        value={newAmount}
                        onChange={(e) => setNewAmount(e.target.value)}
                        placeholder="0,00"
                        className="pl-7 h-9 text-sm"
                        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAddCost(); } }}
                      />
                    </div>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    className="h-9 shrink-0"
                    onClick={handleAddCost}
                    disabled={!newDesc.trim() || !newAmount.trim()}
                  >
                    <Plus className="w-4 h-4" />
                    <span className="ml-1 hidden sm:inline">Hinzufügen</span>
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {!isEdit && (
        <div className="flex items-start gap-3 rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-blue-800">
          <Euro className="w-5 h-5 shrink-0 mt-0.5" />
          <p className="text-sm">
            Kostenpositionen können nach dem Erstellen des Events hinzugefügt werden.
          </p>
        </div>
      )}

      {/* ── Bilder ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Bilder</span>
            <Button type="button" variant="outline" size="sm" onClick={addImage}>
              <Plus className="w-4 h-4 mr-1" />
              Bild hinzufügen
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {images.length > 0 ? (
            <Reorder.Group axis="y" values={images} onReorder={setImages} className="space-y-3">
              {images.map((img) => (
                <Reorder.Item key={img._key} value={img} className="flex gap-2 items-start bg-gray-50 border rounded-lg p-3">
                  <div className="mt-2 cursor-grab active:cursor-grabbing text-gray-400 shrink-0">
                    <GripVertical className="w-4 h-4" />
                  </div>
                  <div className="flex-1 space-y-2">
                    <div className="flex gap-2 items-center">
                      <div className="flex-1 relative">
                        <Input
                          value={img.url}
                          onChange={(e) => updateImage(img._key, "url", e.target.value)}
                          onBlur={(e) => validateImage(img._key, e.target.value)}
                          placeholder="https://beispiel.de/bild.jpg"
                          className={img.valid === false ? "border-red-400 pr-8" : img.valid === true ? "border-green-400 pr-8" : ""}
                        />
                        {img.valid === false && <AlertCircle className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-red-500" />}
                        {img.valid === true && <CheckCircle2 className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-green-500" />}
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeImage(img._key)}
                        className="shrink-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                    <Input
                      value={img.alt_text}
                      onChange={(e) => updateImage(img._key, "alt_text", e.target.value)}
                      placeholder="Bildbeschreibung (Alt-Text)"
                      className="text-sm"
                    />
                    {img.valid === true && img.url && (
                      <div className="mt-1 rounded overflow-hidden border bg-gray-100 h-28">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={img.url} alt={img.alt_text || "Vorschau"} className="w-full h-full object-cover" />
                      </div>
                    )}
                    {img.valid === false && (
                      <p className="text-xs text-red-600">Die URL konnte nicht als Bild geladen werden. Bitte prüfe die URL.</p>
                    )}
                  </div>
                </Reorder.Item>
              ))}
            </Reorder.Group>
          ) : (
            <p className="text-sm text-muted-foreground">
              Noch keine Bilder hinzugefügt. Bilder werden im Karussell auf der Eventseite angezeigt.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Publish confirmation dialog */}
      <Dialog open={publishConfirmOpen} onOpenChange={(o) => { if (!o) setPublishConfirmOpen(false); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Event veröffentlichen</DialogTitle>
            <DialogDescription>
              Möchtest du dieses Event jetzt veröffentlichen? Es wird sofort für alle Besucher sichtbar und Anmeldungen sind möglich.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-3 mt-4">
            <Button variant="outline" onClick={() => setPublishConfirmOpen(false)}>
              Abbrechen
            </Button>
            <Button
              disabled={submitting}
              onClick={(e) => {
                setPublishConfirmOpen(false);
                handleSubmit(e as unknown as React.FormEvent, true);
              }}
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Globe className="w-4 h-4 mr-2" />}
              Veröffentlichen
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Save-as-template dialog */}
      <Dialog open={saveTemplateOpen} onOpenChange={(o) => { if (!o) setSaveTemplateOpen(false); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Als Vorlage speichern</DialogTitle>
            <DialogDescription>
              Die aktuellen Eventdaten (ohne Datum & Uhrzeit) werden als Vorlage gespeichert und
              können für künftige Events wiederverwendet werden.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 mt-2">
            <Label htmlFor="template-name">Vorlagenname *</Label>
            <Input
              id="template-name"
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              placeholder='z.B. "Monatliches Vereinstraining"'
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleSaveTemplate(); } }}
              autoFocus
            />
          </div>
          <div className="flex justify-end gap-3 mt-4">
            <Button variant="outline" onClick={() => setSaveTemplateOpen(false)}>Abbrechen</Button>
            <Button onClick={handleSaveTemplate} disabled={savingTemplate || !templateName.trim()}>
              {savingTemplate ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Vorlage speichern
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Sticky action bar ── */}
      <div className="fixed bottom-0 left-0 right-0 lg:left-64 z-20 bg-white border-t border-gray-200 shadow-lg">
        <div className="max-w-screen-xl mx-auto px-4 md:px-8 py-3 flex flex-wrap items-center gap-2">
          {isDraft ? (
            <>
              <Button
                type="button"
                form="event-form"
                disabled={submitting}
                onClick={() => setPublishConfirmOpen(true)}
              >
                <Globe className="w-4 h-4 mr-2" />
                Jetzt veröffentlichen
              </Button>
              <Button type="submit" form="event-form" variant="outline" disabled={submitting}>
                {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Als Entwurf speichern
              </Button>
            </>
          ) : (
            <Button type="submit" form="event-form" disabled={submitting}>
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  Speichern...
                </>
              ) : (
                "Änderungen speichern"
              )}
            </Button>
          )}

          <Button
            type="button"
            variant="outline"
            onClick={() => { setTemplateName(formData.title || ""); setSaveTemplateOpen(true); }}
          >
            <LayoutTemplate className="w-4 h-4 mr-2" />
            Als Vorlage speichern
          </Button>

          <Button type="button" variant="outline" onClick={() => router.back()}>
            Abbrechen
          </Button>
        </div>
      </div>
    </div>
  );
}
