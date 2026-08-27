"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Cloud,
  GripVertical,
  Leaf,
  Loader2,
  LogIn,
  LogOut,
  Map,
  MapPin,
  PencilLine,
  Plus,
  Trash2,
  Trees,
  Users,
} from "lucide-react";
import type { User } from "@supabase/supabase-js";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/lib/supabase/client";

type ChecklistItem = {
  id: string;
  label: string;
  done: boolean;
};

type ChecklistGroup = {
  id: string;
  title: string;
  items: ChecklistItem[];
};

type ItineraryStop = {
  id: string;
  day: number;
  label: string;
  time: string;
};

type PlannerState = {
  destination: string;
  departing: string;
  returning: string;
  travelers: string;
  stops: ItineraryStop[];
  checklistGroups: ChecklistGroup[];
};

type TripPlanRow = {
  destination: string;
  departure_date: string | null;
  return_date: string | null;
  travelers: string;
  stops: Array<string | ItineraryStop>;
  checklist_groups: ChecklistGroup[];
};

const STORAGE_KEY = "trailmark-local-planner-v1";

const initialPlanner: PlannerState = {
  destination: "Banff National Park",
  departing: "2026-09-01",
  returning: "2026-09-08",
  travelers: "2",
  stops: [
    { id: "arrival-calgary", day: 1, label: "Arrive in Calgary", time: "09:30" },
    { id: "drive-banff", day: 2, label: "Drive to Banff", time: "10:00" },
    { id: "hike-johnston", day: 3, label: "Hike Johnston Canyon", time: "08:00" },
  ],
  checklistGroups: [
    {
      id: "documents",
      title: "Documents",
      items: [
        { id: "passport", label: "Check passport validity", done: false },
        { id: "insurance", label: "Save travel insurance copy", done: false },
      ],
    },
    {
      id: "packing",
      title: "Packing",
      items: [
        { id: "layers", label: "Pack weather-ready layers", done: false },
        { id: "shoes", label: "Bring comfortable walking shoes", done: false },
      ],
    },
  ],
};

const destinations = [
  {
    name: "Banff National Park",
    location: "Alberta, Canada",
    tag: "Mountains",
    image:
      "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?auto=format&fit=crop&w=1000&q=85",
  },
  {
    name: "Redwood Coast",
    location: "California, USA",
    tag: "Forest",
    image:
      "https://images.unsplash.com/photo-1441974231531-c6227db76b6e?auto=format&fit=crop&w=1000&q=85",
  },
  {
    name: "Torres del Paine",
    location: "Patagonia, Chile",
    tag: "Wilderness",
    image:
      "https://images.unsplash.com/photo-1500534623283-312aade485b7?auto=format&fit=crop&w=1000&q=85",
  },
  {
    name: "Palawan",
    location: "Philippines",
    tag: "Islands",
    image:
      "https://images.unsplash.com/photo-1470770903676-69b98201ea1c?auto=format&fit=crop&w=1000&q=85",
  },
  {
    name: "Swiss Alps",
    location: "Switzerland",
    tag: "Mountains",
    image:
      "https://images.unsplash.com/photo-1500375592092-40eb2168fd21?auto=format&fit=crop&w=1000&q=85",
  },
  {
    name: "Amazon Basin",
    location: "Ecuador",
    tag: "Rainforest",
    image:
      "https://images.unsplash.com/photo-1518098268026-4e89f1a2cd8e?auto=format&fit=crop&w=1000&q=85",
  },
];

const makeId = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

function normalizeStops(stops: unknown): ItineraryStop[] {
  if (!Array.isArray(stops)) return initialPlanner.stops;

  return stops.flatMap((stop, index) => {
    if (typeof stop === "string") {
      return [{ id: `legacy-stop-${index}`, day: 1, label: stop, time: "" }];
    }

    if (
      stop &&
      typeof stop === "object" &&
      "label" in stop &&
      typeof stop.label === "string"
    ) {
      const day = "day" in stop && typeof stop.day === "number" ? stop.day : 1;
      const id = "id" in stop && typeof stop.id === "string"
        ? stop.id
        : `saved-stop-${index}`;
      const time = "time" in stop && typeof stop.time === "string"
        ? stop.time
        : "";
      return [{ id, day: Math.max(1, Math.floor(day)), label: stop.label, time }];
    }

    return [];
  });
}

function toDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export default function Home() {
  const [planner, setPlanner] = useState<PlannerState>(initialPlanner);
  const [stopDrafts, setStopDrafts] = useState<Record<number, string>>({});
  const [stopTimeDrafts, setStopTimeDrafts] = useState<Record<number, string>>({});
  const [draggedStopId, setDraggedStopId] = useState<string | null>(null);
  const [dragOverStopId, setDragOverStopId] = useState<string | null>(null);
  const [groupDraft, setGroupDraft] = useState("");
  const [itemDrafts, setItemDrafts] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [email, setEmail] = useState("");
  const [authMessage, setAuthMessage] = useState("");
  const [cloudBusy, setCloudBusy] = useState(false);
  const plannerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      try {
        const saved = window.localStorage.getItem(STORAGE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved) as PlannerState;
          setPlanner({ ...parsed, stops: normalizeStops(parsed.stops) });
        }
      } catch {
        setMessage("Your saved draft could not be loaded, so a fresh one was opened.");
      } finally {
        setHydrated(true);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(planner));
  }, [hydrated, planner]);

  useEffect(() => {
    let active = true;

    void supabase.auth.getUser().then(({ data }) => {
      if (active) setUser(data.user ?? null);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!user) return;

    let active = true;
    void supabase
      .from("trip_plans")
      .select(
        "destination, departure_date, return_date, travelers, stops, checklist_groups",
      )
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!active) return;
        if (error) {
          setAuthMessage("Cloud data could not be loaded. Your local draft is still safe.");
          return;
        }
        if (data) {
          const row = data as TripPlanRow;
          setPlanner({
            destination: row.destination,
            departing: row.departure_date ?? "",
            returning: row.return_date ?? "",
            travelers: row.travelers,
            stops: normalizeStops(row.stops),
            checklistGroups: row.checklist_groups,
          });
          setAuthMessage("Your cloud trip has been loaded.");
        }
      });

    return () => {
      active = false;
    };
  }, [user]);

  const tripLength = useMemo(() => {
    if (!planner.departing || !planner.returning) return null;
    const start = new Date(`${planner.departing}T00:00:00`);
    const end = new Date(`${planner.returning}T00:00:00`);
    const days = Math.ceil((end.getTime() - start.getTime()) / 86_400_000) + 1;
    return days > 0 ? days : null;
  }, [planner.departing, planner.returning]);

  const tripDays = useMemo(() => {
    if (!tripLength || !planner.departing) {
      return [{ number: 1, isoDate: "", dateLabel: "Add travel dates" }];
    }

    const start = new Date(`${planner.departing}T00:00:00`);
    return Array.from({ length: tripLength }, (_, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      return {
        number: index + 1,
        isoDate: toDateInputValue(date),
        dateLabel: date.toLocaleDateString("en-US", {
          weekday: "short",
          month: "short",
          day: "numeric",
        }),
      };
    });
  }, [planner.departing, tripLength]);

  const completedItems = planner.checklistGroups.reduce(
    (total, group) => total + group.items.filter((item) => item.done).length,
    0,
  );
  const totalItems = planner.checklistGroups.reduce(
    (total, group) => total + group.items.length,
    0,
  );

  function updatePlanner<K extends keyof PlannerState>(
    key: K,
    value: PlannerState[K],
  ) {
    setPlanner((current) => ({ ...current, [key]: value }));
    setMessage("");
  }

  function createTripDraft(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!planner.destination.trim()) {
      setMessage("Add a destination to start your trip draft.");
      return;
    }
    if (planner.departing && planner.returning && !tripLength) {
      setMessage("Your return date needs to be after your departure date.");
      return;
    }

    const duration = tripLength ? `${tripLength}-day ` : "";
    setMessage(
      `Your ${duration}${planner.destination.trim()} draft is saved on this device.`,
    );
    document.getElementById("itinerary")?.scrollIntoView({ behavior: "smooth" });
  }

  function chooseDestination(name: string) {
    setPlanner((current) => ({ ...current, destination: name }));
    setMessage(`${name} added to your trip draft.`);
    plannerRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function addStop(event: React.FormEvent<HTMLFormElement>, day: number) {
    event.preventDefault();
    const nextStop = (stopDrafts[day] ?? "").trim();
    const nextTime = stopTimeDrafts[day] ?? "";
    if (!nextStop) return;
    if (
      planner.stops.some(
        (stop) => stop.day === day
          && stop.label.toLowerCase() === nextStop.toLowerCase()
          && stop.time === nextTime,
      )
    ) {
      setMessage(`That stop is already listed for Day ${day}.`);
      return;
    }
    updatePlanner("stops", [
      ...planner.stops,
      { id: makeId("stop"), day, label: nextStop, time: nextTime },
    ]);
    setStopDrafts((drafts) => ({ ...drafts, [day]: "" }));
    setStopTimeDrafts((drafts) => ({ ...drafts, [day]: "" }));
  }

  function removeStop(stopId: string) {
    updatePlanner("stops", planner.stops.filter((stop) => stop.id !== stopId));
  }

  function updateStopTime(stopId: string, time: string) {
    updatePlanner(
      "stops",
      planner.stops.map((stop) => stop.id === stopId ? { ...stop, time } : stop),
    );
  }

  function updateStopLabel(stopId: string, label: string) {
    updatePlanner(
      "stops",
      planner.stops.map((stop) => stop.id === stopId ? { ...stop, label } : stop),
    );
  }

  function reorderStop(stopId: string, targetStopId: string, day: number) {
    if (stopId === targetStopId) return;

    setPlanner((current) => {
      const isInDay = (stop: ItineraryStop) =>
        Math.min(stop.day, tripDays.length) === day;
      const dayStops = current.stops.filter(isInDay);
      const fromIndex = dayStops.findIndex((stop) => stop.id === stopId);
      const toIndex = dayStops.findIndex((stop) => stop.id === targetStopId);

      if (fromIndex < 0 || toIndex < 0) return current;

      const reordered = [...dayStops];
      const [moved] = reordered.splice(fromIndex, 1);
      reordered.splice(toIndex, 0, moved);

      let replacementIndex = 0;
      return {
        ...current,
        stops: current.stops.map((stop) =>
          isInDay(stop) ? reordered[replacementIndex++] : stop,
        ),
      };
    });
    setMessage("");
  }

  function addChecklistGroup(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = groupDraft.trim();
    if (!title) return;
    if (
      planner.checklistGroups.some(
        (group) => group.title.toLowerCase() === title.toLowerCase(),
      )
    ) {
      setMessage(`“${title}” is already in your preparation list.`);
      return;
    }
    updatePlanner("checklistGroups", [
      ...planner.checklistGroups,
      { id: makeId("group"), title, items: [] },
    ]);
    setGroupDraft("");
  }

  function removeChecklistGroup(groupId: string) {
    updatePlanner(
      "checklistGroups",
      planner.checklistGroups.filter((group) => group.id !== groupId),
    );
  }

  function addChecklistItem(
    event: React.FormEvent<HTMLFormElement>,
    groupId: string,
  ) {
    event.preventDefault();
    const label = (itemDrafts[groupId] ?? "").trim();
    if (!label) return;

    const group = planner.checklistGroups.find((item) => item.id === groupId);
    if (group?.items.some((item) => item.label.toLowerCase() === label.toLowerCase())) {
      setMessage(`“${label}” is already in ${group.title}.`);
      return;
    }

    updatePlanner(
      "checklistGroups",
      planner.checklistGroups.map((item) =>
        item.id === groupId
          ? {
              ...item,
              items: [...item.items, { id: makeId("item"), label, done: false }],
            }
          : item,
      ),
    );
    setItemDrafts((drafts) => ({ ...drafts, [groupId]: "" }));
  }

  function toggleChecklistItem(groupId: string, itemId: string, done: boolean) {
    updatePlanner(
      "checklistGroups",
      planner.checklistGroups.map((group) =>
        group.id === groupId
          ? {
              ...group,
              items: group.items.map((item) =>
                item.id === itemId ? { ...item, done } : item,
              ),
            }
          : group,
      ),
    );
  }

  function removeChecklistItem(groupId: string, itemId: string) {
    updatePlanner(
      "checklistGroups",
      planner.checklistGroups.map((group) =>
        group.id === groupId
          ? { ...group, items: group.items.filter((item) => item.id !== itemId) }
          : group,
      ),
    );
  }

  async function sendMagicLink(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!email.trim()) return;
    setCloudBusy(true);
    setAuthMessage("");

    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: window.location.origin },
    });

    setCloudBusy(false);
    setAuthMessage(
      error
        ? error.message
        : "Check your email and open the secure sign-in link to enable cloud sync.",
    );
  }

  async function saveToCloud() {
    if (!user) return;
    setCloudBusy(true);
    setAuthMessage("");

    const { error } = await supabase.from("trip_plans").upsert(
      {
        user_id: user.id,
        title: planner.destination
          ? `Trip to ${planner.destination}`
          : "My trip",
        destination: planner.destination,
        departure_date: planner.departing || null,
        return_date: planner.returning || null,
        travelers: planner.travelers,
        stops: planner.stops,
        checklist_groups: planner.checklistGroups,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );

    setCloudBusy(false);
    setAuthMessage(
      error ? error.message : "Your trip is safely synced to the cloud.",
    );
  }

  async function signOut() {
    setCloudBusy(true);
    await supabase.auth.signOut();
    setCloudBusy(false);
    setAuthMessage("Signed out. Your local draft remains on this device.");
  }

  return (
    <main>
      <nav className="topbar" aria-label="Primary navigation">
        <a className="brand" href="#top" aria-label="Trailmark home">
          <span className="brand-mark" aria-hidden="true"><Leaf /></span>
          <span>Trailmark</span>
        </a>
        <div className="nav-links">
          <a href="#destinations">Destinations</a>
          <a href="#itinerary">Itinerary</a>
          <a href="#prepare">Prepare</a>
        </div>
        <Button asChild className="nav-cta">
          <a href="#planner">Start planning <ArrowRight /></a>
        </Button>
      </nav>

      <header className="hero" id="top">
        <div className="hero-shade" />
        <div className="hero-content">
          <span className="eyebrow light">Wander further</span>
          <h1>Plan trips that feel like the outdoors.</h1>
          <p>
            Build itineraries, choose nature-forward destinations, and keep every
            detail of your next adventure in one calm place.
          </p>
          <div className="hero-actions">
            <Button asChild className="hero-primary" size="lg">
              <a href="#planner">Plan your trip <ArrowRight /></a>
            </Button>
            <Button asChild variant="outline" className="hero-secondary" size="lg">
              <a href="#destinations">Browse destinations</a>
            </Button>
          </div>
        </div>
        <div className="hero-note" aria-label="Local prototype status">
          <span className="status-dot" />
          Local draft mode
        </div>
      </header>

      <section className="planner-wrap" id="planner" aria-labelledby="planner-title">
        <div className="planner-card" ref={plannerRef}>
          <div className="planner-heading">
            <span className="step-label">01 · Start your trip</span>
            <h2 id="planner-title">
              {planner.destination.trim() || "Your destination"} Trip Planner
            </h2>
          </div>
          <form className="planner-form" onSubmit={createTripDraft}>
            <label className="field destination-field">
              <span><MapPin /> Destination</span>
              <Input
                value={planner.destination}
                onChange={(event) => updatePlanner("destination", event.target.value)}
                placeholder="Where to?"
                autoComplete="off"
              />
            </label>
            <label className="field">
              <span><CalendarDays /> Departing</span>
              <Input
                type="date"
                value={planner.departing}
                onChange={(event) => updatePlanner("departing", event.target.value)}
              />
            </label>
            <label className="field">
              <span><CalendarDays /> Returning</span>
              <Input
                type="date"
                min={planner.departing || undefined}
                value={planner.returning}
                onChange={(event) => updatePlanner("returning", event.target.value)}
              />
            </label>
            <div className="field">
              <span><Users /> Travelers</span>
              <Select
                value={planner.travelers}
                onValueChange={(value) => updatePlanner("travelers", value)}
              >
                <SelectTrigger aria-label="Number of travelers">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1 traveler</SelectItem>
                  <SelectItem value="2">2 travelers</SelectItem>
                  <SelectItem value="3">3 travelers</SelectItem>
                  <SelectItem value="4+">4+ travelers</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button type="submit" className="planner-submit" size="lg">
              Create draft <ArrowRight />
            </Button>
          </form>
          <div className="planner-meta" aria-live="polite">
            <span>{tripLength ? `${tripLength} days` : "Flexible dates"}</span>
            <span>{planner.travelers === "1" ? "1 traveler" : `${planner.travelers} travelers`}</span>
            <span>Saved on this device</span>
          </div>
          {message && <p className="planner-message">{message}</p>}
        </div>
        <div className="cloud-panel">
          <div className="cloud-heading">
            <span className="cloud-icon"><Cloud /></span>
            <div>
              <strong>{user ? "Cloud sync is ready" : "Save across your devices"}</strong>
              <p>
                {user
                  ? user.email
                  : "Sign in with a secure email link—no password needed."}
              </p>
            </div>
          </div>
          {user ? (
            <div className="cloud-actions">
              <Button type="button" onClick={saveToCloud} disabled={cloudBusy}>
                {cloudBusy ? <Loader2 className="spin" /> : <Cloud />}
                Save to cloud
              </Button>
              <Button type="button" variant="ghost" onClick={signOut} disabled={cloudBusy}>
                <LogOut /> Sign out
              </Button>
            </div>
          ) : (
            <form className="cloud-form" onSubmit={sendMagicLink}>
              <Input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
                aria-label="Email address for cloud sign-in"
                required
              />
              <Button type="submit" disabled={cloudBusy}>
                {cloudBusy ? <Loader2 className="spin" /> : <LogIn />}
                Email me a link
              </Button>
            </form>
          )}
          {authMessage && <p className="cloud-message" aria-live="polite">{authMessage}</p>}
        </div>
      </section>

      <section className="itinerary-section section-shell" id="itinerary">
        <div className="itinerary-panel">
          <div className="itinerary-content">
            <span className="eyebrow light">02 · Shape the route</span>
            <h2>Build your itinerary</h2>
            <p>
              {tripLength
                ? `${tripLength} days are ready for you to organize.`
                : "Choose your departing and returning dates to create each travel day."}
            </p>
            <div className="day-plans" aria-label={`${tripDays.length}-day itinerary`}>
              {tripDays.map((day) => {
                const stopsForDay = planner.stops.filter(
                  (stop) => Math.min(stop.day, tripDays.length) === day.number,
                );

                return (
                  <article className="day-plan" key={day.number}>
                    <div className="day-heading">
                      <div>
                        <span>Day {day.number}</span>
                        {day.isoDate ? (
                          <time dateTime={day.isoDate}>{day.dateLabel}</time>
                        ) : (
                          <small>{day.dateLabel}</small>
                        )}
                      </div>
                      <small>
                        {stopsForDay.length} {stopsForDay.length === 1 ? "stop" : "stops"}
                      </small>
                    </div>
                    <form
                      className="inline-form day-form"
                      onSubmit={(event) => addStop(event, day.number)}
                    >
                      <Input
                        className="day-time-input"
                        type="time"
                        value={stopTimeDrafts[day.number] ?? ""}
                        onChange={(event) => setStopTimeDrafts((drafts) => ({
                          ...drafts,
                          [day.number]: event.target.value,
                        }))}
                        aria-label={`Time for new Day ${day.number} stop`}
                      />
                      <Input
                        value={stopDrafts[day.number] ?? ""}
                        onChange={(event) => setStopDrafts((drafts) => ({
                          ...drafts,
                          [day.number]: event.target.value,
                        }))}
                        placeholder={`Add a stop for Day ${day.number}`}
                        aria-label={`New itinerary stop for Day ${day.number}`}
                      />
                      <Button type="submit" aria-label={`Add stop to Day ${day.number}`}>
                        Add <Plus />
                      </Button>
                    </form>
                    <ol className="stop-list">
                      {stopsForDay.length === 0 ? (
                        <li className="empty-row">No plans yet for this day.</li>
                      ) : (
                        stopsForDay.map((stop, index) => (
                          <li
                            className={dragOverStopId === stop.id ? "drag-over" : undefined}
                            key={stop.id}
                            onDragOver={(event) => {
                              if (!draggedStopId || draggedStopId === stop.id) return;
                              event.preventDefault();
                              event.dataTransfer.dropEffect = "move";
                              setDragOverStopId(stop.id);
                            }}
                            onDrop={(event) => {
                              event.preventDefault();
                              const sourceId = draggedStopId
                                ?? event.dataTransfer.getData("text/plain");
                              if (sourceId) reorderStop(sourceId, stop.id, day.number);
                              setDraggedStopId(null);
                              setDragOverStopId(null);
                            }}
                          >
                            <button
                              type="button"
                              className="drag-handle"
                              draggable
                              onDragStart={(event) => {
                                setDraggedStopId(stop.id);
                                event.dataTransfer.effectAllowed = "move";
                                event.dataTransfer.setData("text/plain", stop.id);
                              }}
                              onDragEnd={() => {
                                setDraggedStopId(null);
                                setDragOverStopId(null);
                              }}
                              aria-label={`Drag ${stop.label} to reorder Day ${day.number}`}
                              title="Drag to reorder"
                            >
                              <GripVertical />
                            </button>
                            <span className="stop-number">
                              {String(index + 1).padStart(2, "0")}
                            </span>
                            <Input
                              className="stop-time-input"
                              type="time"
                              value={stop.time}
                              onChange={(event) => updateStopTime(stop.id, event.target.value)}
                              aria-label={`Time for ${stop.label} on Day ${day.number}`}
                            />
                            <Input
                              className="stop-name-input"
                              value={stop.label}
                              onChange={(event) => updateStopLabel(stop.id, event.target.value)}
                              aria-label={`Name for stop ${index + 1} on Day ${day.number}`}
                              title="Edit stop name"
                            />
                            <span className="stop-actions">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon-sm"
                                onClick={() => removeStop(stop.id)}
                                aria-label={`Remove ${stop.label} from Day ${day.number}`}
                              >
                                <Trash2 />
                              </Button>
                            </span>
                          </li>
                        ))
                      )}
                    </ol>
                  </article>
                );
              })}
            </div>
          </div>
          <div className="itinerary-visual" aria-label="Hiker looking across a mountain landscape">
            <div className="route-badge">
              <Map />
              <span><strong>{planner.stops.length}</strong> planned stops</span>
            </div>
          </div>
        </div>
      </section>

      <section className="prepare-section section-shell" id="prepare">
        <div className="section-heading centered-heading">
          <span className="eyebrow">03 · Pack with confidence</span>
          <h2>Need to prepare</h2>
          <p>Group the important things, then check them off before departure.</p>
        </div>
        <div className="prepare-layout">
          <aside className="prepare-summary">
            <div className="summary-orbit">
              <span>{totalItems ? Math.round((completedItems / totalItems) * 100) : 0}%</span>
            </div>
            <h3>Ready when you are</h3>
            <p>{completedItems} of {totalItems} preparation items complete.</p>
            <div className="progress-track" aria-label={`${completedItems} of ${totalItems} items complete`}>
              <span style={{ width: `${totalItems ? (completedItems / totalItems) * 100 : 0}%` }} />
            </div>
          </aside>
          <div className="prepare-card">
            <form className="inline-form group-form" onSubmit={addChecklistGroup}>
              <Input
                value={groupDraft}
                onChange={(event) => setGroupDraft(event.target.value)}
                placeholder="Add a category, e.g. Reservations"
                aria-label="New preparation category"
              />
              <Button type="submit">Add category <Plus /></Button>
            </form>
            <div className="checklist-groups">
              {planner.checklistGroups.length === 0 ? (
                <div className="empty-checklist">
                  <CheckCircle2 />
                  <p>No preparation categories yet.</p>
                </div>
              ) : (
                planner.checklistGroups.map((group) => (
                  <article className="checklist-group" key={group.id}>
                    <div className="group-heading">
                      <h3>{group.title}</h3>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeChecklistGroup(group.id)}
                        aria-label={`Remove ${group.title} category`}
                      >
                        Remove
                      </Button>
                    </div>
                    <form className="inline-form item-form" onSubmit={(event) => addChecklistItem(event, group.id)}>
                      <Input
                        value={itemDrafts[group.id] ?? ""}
                        onChange={(event) => setItemDrafts((drafts) => ({ ...drafts, [group.id]: event.target.value }))}
                        placeholder="Add something to prepare"
                        aria-label={`Add an item to ${group.title}`}
                      />
                      <Button type="submit" size="icon" aria-label={`Add item to ${group.title}`}><Plus /></Button>
                    </form>
                    <ul>
                      {group.items.map((item) => (
                        <li className={item.done ? "checked" : ""} key={item.id}>
                          <Checkbox
                            id={item.id}
                            checked={item.done}
                            onCheckedChange={(checked) => toggleChecklistItem(group.id, item.id, checked === true)}
                          />
                          <label htmlFor={item.id}>{item.label}</label>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-xs"
                            onClick={() => removeChecklistItem(group.id, item.id)}
                            aria-label={`Remove ${item.label}`}
                          >
                            <Trash2 />
                          </Button>
                        </li>
                      ))}
                    </ul>
                  </article>
                ))
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="destinations section-shell" id="destinations">
        <div className="section-heading split-heading">
          <div>
            <span className="eyebrow">Popular right now</span>
            <h2>Nature-forward destinations</h2>
          </div>
          <p>Open air, memorable trails, and room to breathe—picked for the kind of trip that feels restorative.</p>
        </div>
        <div className="destination-grid">
          {destinations.map((destination) => (
            <Card className="destination-card" key={destination.name}>
              <button
                type="button"
                onClick={() => chooseDestination(destination.name)}
                aria-label={`Plan a trip to ${destination.name}`}
              >
                <span
                  className="destination-image"
                  style={{ backgroundImage: `url(${destination.image})` }}
                >
                  <span className="destination-tag">{destination.tag}</span>
                </span>
                <span className="destination-copy">
                  <span>
                    <strong>{destination.name}</strong>
                    <small>{destination.location}</small>
                  </span>
                  <span className="circle-arrow" aria-hidden="true"><ArrowRight /></span>
                </span>
              </button>
            </Card>
          ))}
        </div>
      </section>

      <section className="why-section section-shell" id="why">
        <div className="section-heading centered-heading">
          <span className="eyebrow">Why Trailmark</span>
          <h2>Planning that stays out of your way</h2>
        </div>
        <div className="why-grid">
          <article>
            <span className="feature-icon"><MapPin /></span>
            <h3>One place for everything</h3>
            <p>Dates, destinations, stops, and preparation tasks stay together.</p>
          </article>
          <article>
            <span className="feature-icon"><Trees /></span>
            <h3>Nature-first picks</h3>
            <p>Start with places chosen for trails, coastlines, and open air.</p>
          </article>
          <article>
            <span className="feature-icon"><PencilLine /></span>
            <h3>Easy to adjust</h3>
            <p>Add or remove details in seconds as your plans change.</p>
          </article>
        </div>
      </section>

      <footer>
        <div className="footer-inner">
          <a className="brand footer-brand" href="#top"><span className="brand-mark"><Leaf /></span> Trailmark</a>
          <p>Trips with more breathing room.</p>
          <div className="footer-links">
            <a href="#destinations">Destinations</a>
            <a href="#itinerary">Itinerary</a>
            <a href="#prepare">Prepare</a>
          </div>
        </div>
        <div className="footer-base">
          <span>© 2026 Trailmark</span>
          <span>Local prototype · cloud sync comes next</span>
        </div>
      </footer>
    </main>
  );
}
