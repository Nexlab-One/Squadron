import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type {
  LiveEvent,
  LiveFeedFilter,
  LiveFeedItem,
  LiveFeedItemKind,
} from "@paperclipai/shared";
import {
  LIVE_FEED_MAX_ITEMS,
  LIVE_FEED_HYDRATE_LIMIT,
  LIVE_FEED_TERMINAL_RUN_STATUSES,
} from "@paperclipai/shared";
import type { ActivityEvent } from "@paperclipai/shared";
import { activityApi } from "../api/activity";

const STORAGE_KEY_OPEN = "paperclip:live-feed-open";
const STORAGE_KEY_FILTER = "paperclip:live-feed-filter";

function readStorageBoolean(key: string, fallback: boolean): boolean {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : raw === "true";
  } catch {
    return fallback;
  }
}

function readStorageFilter(key: string): LiveFeedFilter {
  try {
    const raw = localStorage.getItem(key);
    if (raw === "all" || raw === "activity" || raw === "runs" || raw === "agents")
      return raw;
  } catch {
    // ignore
  }
  return "all";
}

function writeStorageBoolean(key: string, value: boolean) {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    // ignore
  }
}

function writeStorageFilter(key: string, value: LiveFeedFilter) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // ignore
  }
}

/** Returns true if this event type should be included in the feed (before verbose toggle). */
function shouldIncludeInFeed(event: LiveEvent, includeRunQueued: boolean): boolean {
  if (event.type === "activity.logged") return true;
  if (event.type === "heartbeat.run.log" || event.type === "heartbeat.run.event") return false;
  if (event.type === "heartbeat.run.queued") return includeRunQueued;
  if (event.type === "heartbeat.run.status") {
    const status = typeof event.payload?.status === "string" ? event.payload.status : null;
    return status !== null && (LIVE_FEED_TERMINAL_RUN_STATUSES as readonly string[]).includes(status);
  }
  if (event.type === "agent.status") {
    const status = typeof event.payload?.status === "string" ? event.payload.status : null;
    return status === "running" || status === "error";
  }
  return false;
}

function eventToItemKind(event: LiveEvent): LiveFeedItemKind {
  if (event.type === "activity.logged") return "activity";
  if (event.type === "heartbeat.run.queued" || event.type === "heartbeat.run.status")
    return "run_status";
  if (event.type === "agent.status") return "agent_status";
  return "activity";
}

function getRunId(payload: Record<string, unknown>): string | undefined {
  const runId = payload?.runId;
  return typeof runId === "string" && runId.length > 0 ? runId : undefined;
}

/** Composite key for idempotency: live events use numeric id, hydrated use activity uuid. */
function eventDedupeKey(event: LiveEvent, source: "live" | "activity"): string {
  if (source === "activity") {
    const id = event.payload?.id;
    return typeof id === "string" ? `activity:${id}` : `activity:${event.createdAt}`;
  }
  return `live:${event.id}`;
}

function activityEventToLiveEvent(activity: ActivityEvent, syntheticId: number): LiveEvent {
  return {
    id: syntheticId,
    companyId: activity.companyId,
    type: "activity.logged",
    createdAt:
      activity.createdAt instanceof Date
        ? activity.createdAt.toISOString()
        : String(activity.createdAt),
    payload: {
      actorType: activity.actorType,
      actorId: activity.actorId,
      action: activity.action,
      entityType: activity.entityType,
      entityId: activity.entityId,
      agentId: activity.agentId ?? null,
      runId: activity.runId ?? null,
      details: activity.details ?? null,
      id: activity.id,
    },
  };
}

export interface LiveFeedContextValue {
  items: LiveFeedItem[];
  filter: LiveFeedFilter;
  setFilter: (filter: LiveFeedFilter) => void;
  append: (event: LiveEvent, source?: "live" | "activity") => void;
  clear: () => void;
  hydrate: (companyId: string) => Promise<void>;
  hydratedForCompanyId: string | null;
  stripOpen: boolean;
  setStripOpen: (open: boolean) => void;
  includeRunQueued: boolean;
  setIncludeRunQueued: (value: boolean) => void;
  getFilteredItems: () => LiveFeedItem[];
}

const LiveFeedContext = createContext<LiveFeedContextValue | null>(null);

export function LiveFeedProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<LiveFeedItem[]>([]);
  const [hydratedForCompanyId, setHydratedForCompanyId] = useState<string | null>(null);
  const [filter, setFilterState] = useState<LiveFeedFilter>(() =>
    readStorageFilter(STORAGE_KEY_FILTER),
  );
  const [stripOpen, setStripOpenState] = useState(() =>
    readStorageBoolean(STORAGE_KEY_OPEN, false),
  );
  const [includeRunQueued, setIncludeRunQueued] = useState(false);
  const seenKeysRef = useRef<Set<string>>(new Set());

  const setFilter = useCallback((next: LiveFeedFilter) => {
    setFilterState(next);
    writeStorageFilter(STORAGE_KEY_FILTER, next);
  }, []);

  const setStripOpen = useCallback((open: boolean) => {
    setStripOpenState(open);
    writeStorageBoolean(STORAGE_KEY_OPEN, open);
  }, []);

  const append = useCallback(
    (event: LiveEvent, source: "live" | "activity" = "live") => {
      if (source === "live" && (event as { type?: string }).type === "connected") return;
      if (!shouldIncludeInFeed(event, includeRunQueued)) return;

      const key = eventDedupeKey(event, source);
      if (seenKeysRef.current.has(key)) return;
      seenKeysRef.current.add(key);

      const kind = eventToItemKind(event);
      const runId = getRunId(event.payload ?? {});
      const item: LiveFeedItem = { kind, event, runId };

      setItems((list) => {
        const next = [item, ...list];
        if (next.length > LIVE_FEED_MAX_ITEMS) {
          const kept = next.slice(0, LIVE_FEED_MAX_ITEMS);
          const dropped = next.slice(LIVE_FEED_MAX_ITEMS);
          dropped.forEach((d) => seenKeysRef.current.delete(eventDedupeKey(d.event, "live")));
          return kept;
        }
        return next;
      });
    },
    [includeRunQueued],
  );

  const clear = useCallback(() => {
    setItems([]);
    seenKeysRef.current = new Set();
    // Do not set hydratedForCompanyId to null: LiveFeedStrip would immediately
    // re-hydrate from the activity API and repopulate the feed.
  }, []);

  const hydrate = useCallback(async (companyId: string) => {
    const list = await activityApi.list(companyId);
    const events = Array.isArray(list) ? list : [];
    const toMerge: LiveEvent[] = [];
    let syntheticId = -1;
    for (const a of events.slice(0, LIVE_FEED_HYDRATE_LIMIT)) {
      toMerge.push(activityEventToLiveEvent(a, syntheticId));
      syntheticId -= 1;
    }
    toMerge.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

    const newItems: LiveFeedItem[] = [];
    for (const ev of toMerge) {
      const key = eventDedupeKey(ev, "activity");
      if (seenKeysRef.current.has(key)) continue;
      seenKeysRef.current.add(key);
      newItems.push({ kind: eventToItemKind(ev), event: ev });
    }

    setItems((list) => {
      const combined = [...list];
      for (const it of newItems) combined.push(it);
      combined.sort(
        (x, y) =>
          new Date(y.event.createdAt).getTime() - new Date(x.event.createdAt).getTime(),
      );
      return combined.length > LIVE_FEED_MAX_ITEMS
        ? combined.slice(0, LIVE_FEED_MAX_ITEMS)
        : combined;
    });
    setHydratedForCompanyId(companyId);
  }, []);

  const getFilteredItems = useCallback((): LiveFeedItem[] => {
    if (filter === "all") return items;
    if (filter === "activity") return items.filter((i) => i.kind === "activity");
    if (filter === "runs") return items.filter((i) => i.kind === "run_status");
    if (filter === "agents") return items.filter((i) => i.kind === "agent_status");
    return items;
  }, [items, filter]);

  const value = useMemo<LiveFeedContextValue>(
    () => ({
      items,
      filter,
      setFilter,
      append,
      clear,
      hydrate,
      hydratedForCompanyId,
      stripOpen,
      setStripOpen,
      includeRunQueued,
      setIncludeRunQueued,
      getFilteredItems,
    }),
    [
      items,
      filter,
      setFilter,
      append,
      clear,
      hydrate,
      hydratedForCompanyId,
      stripOpen,
      setStripOpen,
      includeRunQueued,
      setIncludeRunQueued,
      getFilteredItems,
    ],
  );

  return (
    <LiveFeedContext.Provider value={value}>{children}</LiveFeedContext.Provider>
  );
}

export function useLiveFeed(): LiveFeedContextValue {
  const ctx = useContext(LiveFeedContext);
  if (!ctx) throw new Error("useLiveFeed must be used within LiveFeedProvider");
  return ctx;
}
