import { useState, useEffect, useRef, useCallback } from "react";
import {
  searchUsers,
  fetchInterceptedUsers,
  fetchInterceptEvents,
  toggleIntercept,
  deliverInterceptMedia,
  uploadInterceptFile,
  type InterceptedUser,
  type InterceptEvent,
  type SearchUserResult,
} from "../api/client";
import { Input, Select, Button, Spinner, Toast } from "../components/UI";

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

export default function InterceptionsPage() {
  const [users, setUsers] = useState<InterceptedUser[]>([]);
  const [selectedUser, setSelectedUser] = useState<InterceptedUser | null>(null);
  const [events, setEvents] = useState<InterceptEvent[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const showToast = (message: string, type: "success" | "error") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  // SSE ref (not state — avoids stale closure in cleanup effect)
  const eventSourceRef = useRef<EventSource | null>(null);

  // Messages container ref for auto-scroll
  const messagesRef = useRef<HTMLDivElement | null>(null);

  // Media delivery
  const [mediaUrl, setMediaUrl] = useState("");
  const [mediaType, setMediaType] = useState<"video" | "image">("video");
  const [mediaCaption, setMediaCaption] = useState("");
  const [pendingJobId, setPendingJobId] = useState<string | null>(null);
  const [delivering, setDelivering] = useState(false);

  // Upload tab
  const [activeMediaTab, setActiveMediaTab] = useState<"url" | "upload">("url");
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Add intercept modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchUserResult[]>([]);
  const [selectedTelegramId, setSelectedTelegramId] = useState("");
  const [selectedUserName, setSelectedUserName] = useState("");
  const [searchingUsers, setSearchingUsers] = useState(false);

  // ── Load intercepted users ──

  const loadUsers = useCallback(async () => {
    setLoadingUsers(true);
    try {
      const data = await fetchInterceptedUsers();
      setUsers(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load users");
    } finally {
      setLoadingUsers(false);
    }
  }, []);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  // ── Select a user ──

  const selectUser = useCallback(async (user: InterceptedUser) => {
    if (eventSourceRef.current) eventSourceRef.current.close();

    setSelectedUser(user);
    setPendingJobId(null);
    setLoadingEvents(true);

    try {
      const evts = await fetchInterceptEvents(user.telegramId);
      setEvents(evts);

      // Check last event for pending job
      if (evts.length > 0) {
        const last = evts[evts.length - 1];
        if (last.eventType === "generation_started" && last.metadata?.jobId) {
          setPendingJobId(String(last.metadata.jobId));
        }
      }
    } catch {
      // silently degrade; user can retry via selecting again
    } finally {
      setLoadingEvents(false);
    }

    // Start SSE stream
    const es = new EventSource(`/api/intercept/stream/${user.telegramId}`);
    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.type === "connected") return;
        const incoming: InterceptEvent = {
          id: crypto.randomUUID(),
          userId: user.telegramId,
          eventType: data.eventType,
          content: data.content,
          metadata: data.metadata,
          createdAt: data.ts || new Date().toISOString(),
        };
        setEvents((prev) => [...prev, incoming]);
        if (data.eventType === "generation_started" && data.metadata?.jobId) {
          setPendingJobId(String(data.metadata.jobId));
        }
        if (data.eventType === "media_delivered") {
          setPendingJobId(null);
        }
      } catch {
        // ignore malformed SSE data
      }
    };
    es.onerror = () => es.close();
    eventSourceRef.current = es;
  }, []);

  // Cleanup SSE on unmount
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) eventSourceRef.current.close();
    };
  }, []);

  // Auto-scroll messages
  useEffect(() => {
    if (messagesRef.current) {
      messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
    }
  }, [events]);

  // ── Deliver media ──

  const handleDeliver = async () => {
    if (!selectedUser || !mediaUrl.trim()) return;
    const jobId = pendingJobId;
    if (!jobId) {
      showToast("No active job detected for this user", "error");
      return;
    }
    setDelivering(true);
    try {
      const res = await deliverInterceptMedia({
        jobId,
        mediaUrl: mediaUrl.trim(),
        mediaType,
      });
      if (res.success) {
        showToast("Media delivered", "success");
        setMediaUrl("");
        setPendingJobId(null);
        setEvents((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            userId: selectedUser.telegramId,
            eventType: "media_delivered",
            metadata: { mediaType },
            createdAt: new Date().toISOString(),
          },
        ]);
      } else {
        showToast(res.error || "Failed to deliver media", "error");
      }
    } catch (e) {
      showToast(`Error: ${e instanceof Error ? e.message : "Unknown"}`, "error");
    } finally {
      setDelivering(false);
    }
  };

  // ── Upload file ──

  const handleUpload = async () => {
    const fileInput = fileInputRef.current;
    if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
      showToast("Select a file first", "error");
      return;
    }
    setUploading(true);
    try {
      const res = await uploadInterceptFile(fileInput.files[0]);
      if (res.success && res.url) {
        setMediaUrl(res.url);
        setMediaType((res.mediaType as "video" | "image") || "video");
        setActiveMediaTab("url");
        showToast("File uploaded, ready to deliver", "success");
      } else {
        showToast(res.error || "Upload failed", "error");
      }
    } catch (e) {
      showToast(`Upload error: ${e instanceof Error ? e.message : "Unknown"}`, "error");
    } finally {
      setUploading(false);
    }
  };

  // ── Remove intercept ──

  const removeIntercept = async () => {
    if (!selectedUser) return;
    if (!confirm(`Remove intercept from ${selectedUser.firstName || "Unknown"}?`)) return;
    try {
      await toggleIntercept(selectedUser.telegramId, false);
      if (eventSourceRef.current) eventSourceRef.current.close();
      setSelectedUser(null);
      setEvents([]);
      setPendingJobId(null);
      showToast("Intercept removed", "success");
      await loadUsers();
    } catch (e) {
      showToast(`Failed: ${e instanceof Error ? e.message : "Unknown"}`, "error");
    }
  };

  // ── Add intercept modal ──

  const handleAddIntercept = async () => {
    if (!selectedTelegramId) {
      showToast("Please select a user", "error");
      return;
    }
    try {
      const res = await toggleIntercept(selectedTelegramId, true);
      if (res.success) {
        showToast("Intercept enabled", "success");
        setShowAddModal(false);
        setSelectedTelegramId("");
        setSelectedUserName("");
        setSearchQuery("");
        setSearchResults([]);
        await loadUsers();
      } else {
        showToast(res.error || "Failed to enable intercept", "error");
      }
    } catch (e) {
      showToast(`Error: ${e instanceof Error ? e.message : "Unknown"}`, "error");
    }
  };

  // Debounced user search
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    setSearchingUsers(true);
    const timer = setTimeout(async () => {
      try {
        const res = await searchUsers(searchQuery);
        setSearchResults(res);
      } catch {
        setSearchResults([]);
      } finally {
        setSearchingUsers(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // ── Render event bubbles ──

  function renderEvent(evt: InterceptEvent, i: number) {
    const time = evt.createdAt ? formatTime(evt.createdAt) : "";

    if (evt.eventType === "user_message") {
      return (
        <div key={i} className="flex justify-start">
          <div className="max-w-[75%] bg-surface border border-border rounded-lg rounded-bl-none px-3 py-2">
            <div className="text-sm text-text-primary whitespace-pre-wrap">{evt.content}</div>
            <div className="text-[10px] text-text-muted text-right mt-1">{time}</div>
          </div>
        </div>
      );
    }

    if (evt.eventType === "media_delivered") {
      return (
        <div key={i} className="flex justify-end">
          <div className="max-w-[75%] bg-accent/15 border border-accent/30 rounded-lg rounded-br-none px-3 py-2">
            <div className="text-sm text-accent flex items-center gap-1">
              <span className="text-base">✅</span>
              Admin sent {evt.metadata?.mediaType || "media"}
            </div>
            <div className="text-[10px] text-text-muted text-right mt-1">{time}</div>
          </div>
        </div>
      );
    }

    // System events: generation_started, etc.
    const label =
      evt.eventType === "generation_started"
        ? "⚡ Generation paused — waiting for admin media"
        : `📌 ${evt.content || evt.eventType}`;

    return (
      <div key={i} className="flex justify-center">
        <div className="text-xs text-text-muted bg-white/[0.03] px-3 py-1.5 rounded-full">
          {label}
        </div>
      </div>
    );
  }

  // ── Render ──

  return (
    <div className="h-full flex flex-col">
      <div className="flex justify-between items-center mb-4">
        <div>
          <div className="section-title">Live Interceptions</div>
          <div className="section-sub">
            Intercept user generations and deliver custom media.
          </div>
        </div>
        <Button onClick={() => setShowAddModal(true)}>+ Intercept User</Button>
      </div>

      {/* Main split layout */}
      <div className="bg-surface border border-border rounded-xl flex-1 overflow-hidden flex">
        {/* User list sidebar */}
        <div className="w-[280px] border-r border-border overflow-y-auto flex-shrink-0">
          <div className="px-4 py-3 border-b border-border text-xs text-text-muted uppercase font-medium">
            Intercepted Users
          </div>
          {loadingUsers ? (
            <div className="flex items-center justify-center py-8 text-text-muted gap-2">
              <Spinner /> Loading…
            </div>
          ) : users.length === 0 ? (
            <div className="px-4 py-8 text-center text-text-muted text-sm">
              No intercepted users. Click the button above to add one.
            </div>
          ) : (
            users.map((u) => (
              <div
                key={u.telegramId}
                className={`px-4 py-3 cursor-pointer border-b border-border/40 hover:bg-accent/5 transition-colors ${
                  selectedUser?.telegramId === u.telegramId
                    ? "bg-accent/10 border-l-[3px] border-accent"
                    : ""
                }`}
                onClick={() => selectUser(u)}
              >
                <div className="font-semibold text-sm">
                  {u.firstName || "Unknown"}
                </div>
                <div className="text-xs text-text-muted">
                  @{u.username || u.telegramId}
                </div>
                <div className="text-xs text-text-muted mt-0.5">
                  ID: {u.telegramId.slice(0, 12)}
                  {u.tier ? ` · ${u.tier}` : ""}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Chat panel */}
        <div className="flex-1 flex flex-col min-w-0">
          {!selectedUser ? (
            <div className="flex-1 flex items-center justify-center text-text-muted flex-col gap-3">
              <div className="text-4xl">🎯</div>
              <div>Select a user to view their live chat</div>
            </div>
          ) : (
            <>
              {/* Chat header */}
              <div className="px-5 py-3 border-b border-border flex items-center gap-3">
                <div>
                  <div className="font-semibold text-sm">
                    {selectedUser.firstName || "Unknown"}
                    {selectedUser.username ? ` @${selectedUser.username}` : ""}
                  </div>
                  <div className="text-xs text-text-muted">
                    Telegram ID: {selectedUser.telegramId}
                  </div>
                </div>
                <div className="flex items-center gap-1 text-xs text-text-muted">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
                  </span>
                  live
                </div>
                <Button
                  variant="ghost"
                  className="text-red-400 ml-auto"
                  onClick={removeIntercept}
                >
                  Remove
                </Button>
              </div>

              {/* Messages area */}
              <div
                ref={messagesRef}
                className="flex-1 overflow-y-auto p-4 flex flex-col gap-2"
                style={{ scrollBehavior: "smooth" }}
              >
                {loadingEvents ? (
                  <div className="flex items-center justify-center py-8 text-text-muted gap-2">
                    <Spinner /> Loading events…
                  </div>
                ) : events.length === 0 ? (
                  <div className="flex items-center justify-center py-8 text-text-muted text-sm">
                    No events yet. Waiting for user messages…
                  </div>
                ) : (
                  events.map((evt, i) => renderEvent(evt, i))
                )}
              </div>

              {/* Pending job banner */}
              {pendingJobId && (
                <div className="mx-5 mb-2 px-3 py-2 bg-yellow-500/10 border border-yellow-500/20 rounded-lg text-xs text-yellow-400">
                  ⏳ Job: {pendingJobId.slice(0, 24)} — Send media below
                </div>
              )}

              {/* Media input panel */}
              <div className="px-5 py-4 border-t border-border bg-black/10">
                <div className="text-xs text-text-muted mb-2">
                  Deliver media to user (replaces AI generation)
                </div>

                {/* Tab: URL / Upload */}
                <div className="flex gap-0 mb-3">
                  <button
                    className={`px-3 py-1.5 text-xs rounded-tl-lg rounded-bl-lg border transition-colors ${
                      activeMediaTab === "url"
                        ? "bg-accent/20 border-accent text-accent"
                        : "bg-transparent border-border text-text-muted"
                    }`}
                    onClick={() => setActiveMediaTab("url")}
                  >
                    URL
                  </button>
                  <button
                    className={`px-3 py-1.5 text-xs rounded-tr-lg rounded-br-lg border transition-colors ${
                      activeMediaTab === "upload"
                        ? "bg-accent/20 border-accent text-accent"
                        : "bg-transparent border-border text-text-muted"
                    }`}
                    onClick={() => setActiveMediaTab("upload")}
                  >
                    Upload
                  </button>
                </div>

                {activeMediaTab === "url" ? (
                  <div className="flex gap-2">
                    <div className="flex-1 space-y-2">
                      <Input
                        value={mediaUrl}
                        onChange={(e) => setMediaUrl(e.target.value)}
                        placeholder="https://example.com/video.mp4"
                      />
                      <div className="flex gap-2">
                        <Select
                          value={mediaType}
                          onChange={(e) => setMediaType(e.target.value as "video" | "image")}
                        >
                          <option value="video">Video</option>
                          <option value="image">Image</option>
                        </Select>
                        <Input
                          value={mediaCaption}
                          onChange={(e) => setMediaCaption(e.target.value)}
                          placeholder="Caption (optional)"
                        />
                      </div>
                    </div>
                    <Button onClick={handleDeliver} disabled={!mediaUrl.trim() || delivering}>
                      {delivering ? "Sending…" : "Send"}
                    </Button>
                  </div>
                ) : (
                  <div className="flex gap-2 items-end">
                    <div className="flex-1">
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="video/*,image/*"
                        className="w-full text-sm text-text-muted file:mr-3 file:py-1.5 file:px-4 file:rounded-lg file:border file:border-border file:text-sm file:bg-surface file:text-text-primary hover:file:bg-surface-hover/50 cursor-pointer"
                      />
                    </div>
                    <Button onClick={handleUpload} disabled={uploading}>
                      {uploading ? "Uploading…" : "Upload"}
                    </Button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Add intercept modal */}
      {showAddModal && (
        <div
          className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowAddModal(false);
          }}
        >
          <div className="bg-surface border border-border rounded-xl p-7 w-[420px] shadow-2xl">
            <h3 className="font-bold mb-4">Intercept User</h3>

            {selectedTelegramId ? (
              <div className="mb-4 p-3 bg-green-500/10 border border-green-500/30 rounded-lg text-sm text-green-400 flex justify-between items-center">
                <span>Selected: {selectedUserName}</span>
                <Button
                  variant="ghost"
                  className="text-red-400 text-xs px-1 py-0 min-w-0"
                  onClick={() => {
                    setSelectedTelegramId("");
                    setSelectedUserName("");
                  }}
                >
                  ✕
                </Button>
              </div>
            ) : (
              <div className="relative mb-4">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Type name, username, or Telegram ID…"
                  className="w-full px-3 py-2 bg-surface-hover/50 border border-border rounded-lg text-sm text-text-primary outline-none focus:border-accent transition-colors"
                  autoComplete="off"
                />
                {searchingUsers && (
                  <div className="absolute top-full left-0 right-0 mt-1 flex items-center gap-2 px-3 py-2 text-text-muted text-xs">
                    <Spinner /> Searching…
                  </div>
                )}
                {!searchingUsers && searchResults.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-surface border border-border rounded-lg max-h-[220px] overflow-y-auto z-10 shadow-xl">
                    {searchResults.map((u) => (
                      <div
                        key={u.telegramId}
                        className="px-3 py-2.5 cursor-pointer border-b border-border/40 hover:bg-accent/5 text-sm transition-colors"
                        onClick={() => {
                          setSelectedTelegramId(u.telegramId);
                          setSelectedUserName(
                            `${u.firstName || "Unknown"} (@${u.username || u.telegramId})`
                          );
                          setSearchQuery("");
                          setSearchResults([]);
                        }}
                      >
                        <div className="font-semibold">
                          {u.firstName || "Unknown"}
                          <span className="text-text-muted font-normal">
                            {" "}
                            @{u.username || u.telegramId}
                          </span>
                        </div>
                        <div className="text-xs text-text-muted mt-0.5">
                          ID: {u.telegramId} · Tier: {u.tier || "free"}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {!searchingUsers && searchQuery.trim() && searchResults.length === 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 px-3 py-2 text-text-muted text-xs bg-surface border border-border rounded-lg">
                    No users found
                  </div>
                )}
              </div>
            )}

            <div className="flex gap-2 justify-end mt-2">
              <Button variant="ghost" onClick={() => setShowAddModal(false)}>
                Cancel
              </Button>
              <Button onClick={handleAddIntercept} disabled={!selectedTelegramId}>
                Enable Intercept
              </Button>
            </div>
          </div>
        </div>
      )}

      {toast && <Toast message={toast.message} type={toast.type} visible={true} />}
    </div>
  );
}
