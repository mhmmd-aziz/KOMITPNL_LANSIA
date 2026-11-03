import { useCallback, useEffect, useRef, useState } from "react";
import api, { getGroupWsUrl } from "../services/api";
import { dateKeyWib, errorMessage } from "../utils/format";

const LIMIT = 100;
const EMPTY_FILTERS = { status: "", dateFrom: "", dateTo: "" };

function playAlertTone() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const context = new AudioContext();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(880, context.currentTime);
    gain.gain.setValueAtTime(0.18, context.currentTime);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.onended = () => { context.close().catch(() => {}); };
    oscillator.start();
    oscillator.stop(context.currentTime + 0.35);
  } catch { /* Browser audio restrictions must not interrupt visual alerts. */ }
}

function matchesFilters(event, filters) {
  const day = dateKeyWib(event.waktu);
  return (!filters.status || event.status === filters.status)
    && (!filters.dateFrom || day >= filters.dateFrom)
    && (!filters.dateTo || day <= filters.dateTo);
}

function upsert(list, event, matches = true) {
  const next = list.filter((item) => item.id !== event.id);
  if (matches) next.push(event);
  return next.sort((a, b) => new Date(b.waktu) - new Date(a.waktu) || b.id - a.id).slice(0, LIMIT);
}

export default function useAdminData(user) {
  const storageKey = `sigap_active_group_${user.id}`;
  const [groups, setGroups] = useState([]);
  const [groupId, setGroupId] = useState(null);
  const [group, setGroup] = useState(null);
  const [loading, setLoading] = useState(true);
  const [groupLoading, setGroupLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [connected, setConnected] = useState(false);
  const [events, setEvents] = useState([]);
  const [recentEvents, setRecentEvents] = useState([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [eventsError, setEventsError] = useState("");
  const [alerts, setAlerts] = useState([]);
  const [todayEvents, setTodayEvents] = useState([]);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState("");
  const [filters, setFiltersState] = useState(EMPTY_FILTERS);
  const [notice, setNotice] = useState(null);
  const [lastEventUpdate, setLastEventUpdate] = useState(null);

  const alive = useRef(false);
  const activeId = useRef(null);
  const groupsRef = useRef([]);
  const filtersRef = useRef(filters);
  const pending = useRef({});
  const seenEvents = useRef(new Set());
  const deferredEvents = useRef(new Set());
  const revision = useRef(0);
  const eventChanges = useRef(new Map());
  const cameraChanges = useRef(new Map());
  const groupChanges = useRef(new Map());
  const refreshSequence = useRef(0);
  filtersRef.current = filters;
  groupsRef.current = groups;

  // Each resource owns one abort controller; responses from an old group are ignored.
  const beginRequest = useCallback((key, targetId = null) => {
    pending.current[key]?.abort();
    const controller = new AbortController();
    pending.current[key] = controller;
    return {
      signal: controller.signal,
      revision: revision.current,
      current: () => alive.current && !controller.signal.aborted
        && pending.current[key] === controller
        && (targetId === null || activeId.current === targetId),
    };
  }, []);

  // REST may have read its snapshot before a newer socket message arrived.
  // Replay only changes received while that request was in flight.
  const reconcileEvents = useCallback((list, since, id, predicate = () => true, defer = false) => {
    let next = list;
    for (const change of eventChanges.current.values()) {
      if (change.revision > since && Number(change.event.group_id) === id) {
        next = upsert(next, change.event, predicate(change.event));
      }
    }
    return defer ? next.filter((event) => !deferredEvents.current.has(event.id)) : next;
  }, []);

  const reconcileGroup = useCallback((data, since) => {
    const changedGroup = groupChanges.current.get(data.id);
    const current = changedGroup && changedGroup.revision > since ? changedGroup.group : data;
    return {
      ...current,
      cameras: (current.cameras || []).map((camera) => {
        const change = cameraChanges.current.get(`${current.id}:${camera.id}`);
        return change && change.revision > since ? { ...camera, ...change.patch } : camera;
      }),
    };
  }, []);

  const chooseGroup = useCallback((id) => {
    const next = id == null ? null : Number(id);
    if (activeId.current !== next) {
      for (const key of ["group", "events", "summary"]) pending.current[key]?.abort();
      activeId.current = next;
      setGroupId(next);
      setGroup(null);
      setEvents([]);
      setRecentEvents([]);
      setAlerts([]);
      setTodayEvents([]);
      setLastEventUpdate(null);
      setNotice(null);
      setConnected(false);
      setError("");
      setEventsError("");
      setSummaryError("");
      setGroupLoading(next !== null);
      setEventsLoading(next !== null);
      setSummaryLoading(next !== null);
      seenEvents.current = new Set();
      deferredEvents.current = new Set();
      eventChanges.current.clear();
    }
    try {
      if (next === null) localStorage.removeItem(storageKey);
      else localStorage.setItem(storageKey, String(next));
    } catch { /* Storage is optional; selection still works for this session. */ }
  }, [storageKey]);

  const loadGroups = useCallback(async () => {
    const request = beginRequest("groups");
    try {
      const { data } = await api.get("/groups", { signal: request.signal });
      if (!request.current()) return null;
      const resolved = data.map((item) => reconcileGroup(item, request.revision));
      setGroups(resolved);
      groupsRef.current = resolved;
      let preferred = activeId.current;
      if (!preferred) {
        try { preferred = Number(localStorage.getItem(storageKey)) || null; } catch { /* Optional storage. */ }
      }
      const selected = data.find((item) => item.id === preferred)?.id ?? data[0]?.id ?? null;
      chooseGroup(selected);
      setError("");
      return selected;
    } catch (err) {
      if (request.current()) setError(errorMessage(err, "Daftar grup belum dapat dimuat. Coba lagi."));
      return null;
    } finally {
      if (request.current()) setLoading(false);
    }
  }, [beginRequest, chooseGroup, reconcileGroup, storageKey]);

  const loadGroup = useCallback(async (id) => {
    if (!id) return;
    const request = beginRequest("group", id);
    setGroupLoading(true);
    try {
      const { data } = await api.get(`/groups/${id}`, { signal: request.signal });
      if (!request.current()) return;
      const resolved = reconcileGroup(data, request.revision);
      setGroup(resolved);
      setGroups((previous) => previous.map((item) => item.id === id ? resolved : item));
      setError("");
    } catch (err) {
      if (request.current()) {
        setError(errorMessage(err, "Informasi grup belum dapat dimuat. Coba lagi."));
        if ([403, 404].includes(err.response?.status)) {
          setGroup(null);
          pending.current.events?.abort();
          pending.current.summary?.abort();
          setEvents([]);
          setRecentEvents([]);
          setAlerts([]);
          setTodayEvents([]);
          setEventsLoading(false);
          setSummaryLoading(false);
          void loadGroups();
        }
      }
    } finally {
      if (request.current()) setGroupLoading(false);
    }
  }, [beginRequest, loadGroups, reconcileGroup]);

  const loadEvents = useCallback(async (id, silent = false) => {
    if (!id) return;
    const request = beginRequest("events", id);
    const currentFilters = filtersRef.current;
    if (!silent) {
      setEventsLoading(true);
      deferredEvents.current.clear();
    }
    try {
      const params = { group_id: id, limit: LIMIT };
      if (currentFilters.status) params.status = currentFilters.status;
      if (currentFilters.dateFrom) params.date_from = currentFilters.dateFrom;
      if (currentFilters.dateTo) params.date_to = currentFilters.dateTo;
      const { data } = await api.get("/events", { params, signal: request.signal });
      if (!request.current() || currentFilters !== filtersRef.current) return;
      setEvents(reconcileEvents(data, request.revision, id,
        (event) => matchesFilters(event, currentFilters), true));
      setEventsError("");
    } catch (err) {
      if (request.current() && currentFilters === filtersRef.current) {
        setEventsError(errorMessage(err, "Daftar kejadian belum dapat dimuat."));
      }
    } finally {
      if (request.current()) setEventsLoading(false);
    }
  }, [beginRequest, reconcileEvents]);

  const loadSummary = useCallback(async (id, silent = false) => {
    if (!id) return;
    const request = beginRequest("summary", id);
    if (!silent) setSummaryLoading(true);
    const today = dateKeyWib();
    const queries = [
      { group_id: id, limit: LIMIT },
      { group_id: id, status: "baru", limit: LIMIT },
      { group_id: id, date_from: today, date_to: today, limit: LIMIT },
    ];
    const results = await Promise.allSettled(queries.map((params) =>
      api.get("/events", { params, signal: request.signal })));
    if (!request.current()) return;
    const setters = [setRecentEvents, setAlerts, setTodayEvents];
    const predicates = [() => true, (event) => event.status === "baru", (event) => dateKeyWib(event.waktu) === today];
    results.forEach((result, index) => {
      if (result.status === "fulfilled") {
        setters[index](reconcileEvents(result.value.data, request.revision, id, predicates[index]));
        result.value.data.forEach((event) => seenEvents.current.add(event.id));
      }
    });
    const failure = results.find((result) => result.status === "rejected");
    setSummaryError(failure ? errorMessage(failure.reason, "Sebagian ringkasan belum dapat diperbarui.") : "");
    setSummaryLoading(false);
  }, [beginRequest, reconcileEvents]);

  const refreshEvents = useCallback(async () => {
    const id = activeId.current;
    if (id) await Promise.all([loadEvents(id), loadSummary(id)]);
  }, [loadEvents, loadSummary]);

  const refresh = useCallback(async () => {
    const sequence = ++refreshSequence.current;
    setRefreshing(true);
    const before = activeId.current;
    try {
      const id = await loadGroups();
      // A changed selection is loaded by the group effect.
      if (id && id === before && id === activeId.current) {
        await Promise.all([loadGroup(id), loadEvents(id, true), loadSummary(id, true)]);
      }
    } finally {
      if (alive.current && sequence === refreshSequence.current) setRefreshing(false);
    }
  }, [loadGroups, loadGroup, loadEvents, loadSummary]);

  const applyEvent = useCallback((event, created = false) => {
    if (!alive.current || Number(event.group_id) !== activeId.current) return;
    eventChanges.current.set(event.id, { revision: ++revision.current, event });
    setLastEventUpdate(event);
    setRecentEvents((previous) => upsert(previous, event));
    setAlerts((previous) => upsert(previous, event, event.status === "baru"));
    setTodayEvents((previous) => upsert(previous, event, dateKeyWib(event.waktu) === dateKeyWib()));
    const readingList = created && document.activeElement?.closest("[data-event-list]");
    if (readingList) deferredEvents.current.add(event.id);
    if (!deferredEvents.current.has(event.id)) {
      setEvents((previous) => upsert(previous, event, matchesFilters(event, filtersRef.current)));
    }
    if (created && !seenEvents.current.has(event.id)) {
      playAlertTone();
      setNotice({ type: "alert", message: "Ada kejadian baru yang perlu ditinjau.", eventId: event.id });
    }
    seenEvents.current.add(event.id);
  }, []);

  useEffect(() => {
    alive.current = true;
    void loadGroups();
    return () => {
      alive.current = false;
      Object.values(pending.current).forEach((controller) => controller.abort());
    };
  }, [loadGroups]);

  useEffect(() => {
    if (!groupId) return;
    void loadGroup(groupId);
    void loadSummary(groupId);
  }, [groupId, loadGroup, loadSummary]);

  useEffect(() => {
    if (groupId) void loadEvents(groupId);
  }, [groupId, filters, loadEvents]);

  useEffect(() => {
    if (!groupId) return;
    let disposed = false;
    let socket;
    let timer;
    let summaryTimer;
    const isCurrent = () => !disposed && alive.current && activeId.current === groupId;
    const reload = () => {
      if (!isCurrent()) return;
      void loadGroup(groupId);
      void loadEvents(groupId, true);
      void loadSummary(groupId, true);
    };
    const connect = () => {
      if (!isCurrent()) return;
      socket = new WebSocket(getGroupWsUrl(groupId));
      socket.onopen = () => {
        if (!isCurrent()) return;
        setConnected(true);
        // Also reload on first connect to close the gap between initial HTTP
        // reads and the moment this socket started receiving events.
        reload();
      };
      socket.onmessage = ({ data }) => {
        if (!isCurrent()) return;
        let payload;
        try { payload = JSON.parse(data); } catch { return; }
        if (["event.created", "event.updated"].includes(payload.type) && payload.event) {
          applyEvent(payload.event, payload.type === "event.created");
          clearTimeout(summaryTimer);
          summaryTimer = setTimeout(() => {
            if (isCurrent()) void loadSummary(groupId, true);
          }, 500);
        }
        if (["camera.status", "camera.source"].includes(payload.type)) {
          const key = `${groupId}:${payload.camera_id}`;
          const patch = {
            ...cameraChanges.current.get(key)?.patch,
            ...(payload.type === "camera.status" ? { status: payload.status } : { sumber: payload.sumber }),
          };
          cameraChanges.current.set(key, { revision: ++revision.current, patch });
          const update = (current) => !current ? current : {
            ...current,
            cameras: (current.cameras || []).map((camera) => camera.id !== payload.camera_id ? camera : {
              ...camera,
              ...patch,
            }),
          };
          setGroup(update);
          setGroups((previous) => previous.map((item) => item.id === groupId ? update(item) : item));
        }
      };
      socket.onclose = (event) => {
        if (!isCurrent()) return;
        setConnected(false);
        if (event.code === 1008) {
          setError("Akses pembaruan grup tidak tersedia. Periksa kembali akses Anda.");
          void loadGroups();
          return;
        }
        timer = setTimeout(connect, 3000);
      };
      socket.onerror = () => { if (isCurrent()) setConnected(false); };
    };
    connect();
    const handleVisibility = () => { if (document.visibilityState === "visible") reload(); };
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("online", reload);
    return () => {
      disposed = true;
      clearTimeout(timer);
      clearTimeout(summaryTimer);
      socket?.close();
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("online", reload);
    };
  }, [groupId, applyEvent, loadGroup, loadGroups, loadEvents, loadSummary]);

  const selectGroup = useCallback((id) => {
    const numericId = Number(id);
    if (groupsRef.current.some((item) => item.id === numericId)) chooseGroup(numericId);
  }, [chooseGroup]);

  const setFilters = useCallback((next) => {
    setFiltersState((previous) => typeof next === "function" ? next(previous) : { ...EMPTY_FILTERS, ...next });
  }, []);

  const createGroup = useCallback(async (payload) => {
    const { data } = await api.post("/groups", payload);
    if (alive.current) {
      pending.current.groups?.abort();
      setLoading(false);
      setGroups((previous) => [data, ...previous.filter((item) => item.id !== data.id)]);
      groupsRef.current = [data, ...groupsRef.current.filter((item) => item.id !== data.id)];
      chooseGroup(data.id);
      setNotice({ type: "success", message: "Grup berhasil dibuat. Tambahkan kamera dan undang keluarga." });
    }
    return data;
  }, [chooseGroup]);

  const updateGroup = useCallback(async (payload, targetId = activeId.current) => {
    const since = revision.current;
    const { data } = await api.patch(`/groups/${targetId}`, payload);
    if (alive.current) {
      const resolved = reconcileGroup(data, since);
      groupChanges.current.set(data.id, { revision: ++revision.current, group: resolved });
      setGroups((previous) => previous.map((item) => item.id === data.id ? resolved : item));
      if (activeId.current === data.id) {
        setGroup(resolved);
        // Event responses include the group's current contact information.
        void loadEvents(data.id, true);
        void loadSummary(data.id, true);
      }
      setNotice({ type: "success", message: "Informasi grup berhasil diperbarui." });
    }
    return data;
  }, [loadEvents, loadSummary, reconcileGroup]);

  const addCamera = useCallback(async (payload, targetId = activeId.current) => {
    const { data } = await api.post(`/groups/${targetId}/cameras`, payload);
    if (alive.current) {
      pending.current.groups?.abort();
      setLoading(false);
      if (activeId.current === targetId) await loadGroup(targetId);
      else await loadGroups();
      setNotice({ type: "success", message: "Kamera terdaftar. Status koneksi akan diperbarui saat kamera terhubung." });
    }
    return data;
  }, [loadGroup, loadGroups]);

  const deleteCamera = useCallback(async (cameraId, targetId = activeId.current) => {
    const { data } = await api.delete(`/cameras/${cameraId}`);
    if (alive.current) {
      pending.current.groups?.abort();
      setLoading(false);
      cameraChanges.current.delete(`${targetId}:${cameraId}`);
      // Camera deletion also removes related events in the current backend.
      // Discard journal entries so they cannot restore deleted history later.
      for (const [id, change] of eventChanges.current) {
        if (Number(change.event.camera_id) === Number(cameraId)) {
          eventChanges.current.delete(id);
          deferredEvents.current.delete(id);
        }
      }
      const removeCamera = (item) => !item ? item : {
        ...item,
        cameras: (item.cameras || []).filter((camera) => Number(camera.id) !== Number(cameraId)),
      };
      setGroups((previous) => previous.map((item) => item.id === targetId ? removeCamera(item) : item));
      if (activeId.current === targetId) {
        setGroup(removeCamera);
        const removeEvents = (previous) => previous.filter((event) => Number(event.camera_id) !== Number(cameraId));
        setEvents(removeEvents);
        setRecentEvents(removeEvents);
        setAlerts(removeEvents);
        setTodayEvents(removeEvents);
        setLastEventUpdate((previous) => Number(previous?.camera_id) === Number(cameraId) ? null : previous);
        await Promise.all([loadGroup(targetId), loadEvents(targetId, true), loadSummary(targetId, true)]);
      } else {
        await loadGroups();
      }
      if (alive.current) setNotice({ type: "success", message: "Kamera berhasil dihapus. Daftar kamera dan kejadian telah diperbarui." });
    }
    return data;
  }, [loadGroup, loadGroups, loadEvents, loadSummary]);

  const removeMember = useCallback(async (userId, targetId = activeId.current) => {
    const { data } = await api.delete(`/groups/${targetId}/members/${userId}`);
    if (alive.current) {
      pending.current.groups?.abort();
      setLoading(false);
      if (activeId.current === targetId) await loadGroup(targetId);
      else await loadGroups();
      setNotice({ type: "success", message: "Anggota berhasil dikeluarkan dari grup." });
    }
    return data;
  }, [loadGroup, loadGroups]);

  const getEvent = useCallback(async (id) => {
    const since = revision.current;
    const { data } = await api.get(`/events/${id}`);
    const change = eventChanges.current.get(data.id);
    return change && change.revision > since ? change.event : data;
  }, []);

  const updateEvent = useCallback(async (id, status, expectedStatus = "baru") => {
    const latest = await getEvent(id);
    if (expectedStatus && latest.status !== expectedStatus) {
      applyEvent(latest);
      const conflict = new Error("Status kejadian telah diperbarui oleh anggota grup. Periksa status terbaru.");
      conflict.updatedEvent = latest;
      throw conflict;
    }
    const { data } = await api.patch(`/events/${id}`, { status });
    applyEvent(data);
    if (alive.current) {
      if (activeId.current === data.group_id) void loadSummary(data.group_id, true);
      setNotice({ type: "success", message: status === "ditangani" ? "Kejadian ditandai sudah ditangani." : "Kejadian ditandai sebagai alarm palsu." });
    }
    return data;
  }, [getEvent, applyEvent, loadSummary]);

  const clearNotice = useCallback(() => setNotice(null), []);

  return {
    groups, groupId, group, loading, groupLoading, error, refreshing, connected,
    events, eventsLoading, eventsError, recentEvents, alerts, todayEvents,
    summaryLoading, summaryError, filters, setFilters, selectGroup, refresh,
    refreshEvents, createGroup, updateGroup, addCamera, deleteCamera, removeMember, updateEvent,
    getEvent, acceptEvent: applyEvent, lastEventUpdate, notice, clearNotice, limit: LIMIT,
  };
}
