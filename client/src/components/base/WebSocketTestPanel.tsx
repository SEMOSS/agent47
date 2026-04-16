import { useInsight, useWebSocket } from "@semoss/sdk/react";
import { X } from "lucide-react";
import { useRef, useState } from "react";

/**
 * Small panel that tests the WebSocket connection by connecting
 * to the current insight's socket and sending a pixel command.
 */
export const WebSocketTestPanel = ({ onClose }: { onClose: () => void }) => {
  const { insightId } = useInsight();
  const {
    send,
    watch,
    unwatch,
    lastMessage,
    status,
    isConnected,
    connect,
    close,
  } = useWebSocket(insightId);
  const [logs, setLogs] = useState<string[]>([]);
  const [roomId, setRoomId] = useState("");
  const [watching, setWatching] = useState(false);
  const logsEndRef = useRef<HTMLDivElement>(null);

  const log = (msg: string) => {
    setLogs((prev) => [...prev.slice(-49), msg]);
    console.log(msg);
    setTimeout(
      () => logsEndRef.current?.scrollIntoView({ behavior: "smooth" }),
      50,
    );
  };

  const handleSend = () => {
    try {
      send("MyProjects();");
      log("> pixel: MyProjects();");
    } catch (err) {
      log(`Error: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleWatch = () => {
    if (!roomId.trim()) {
      log("Error: enter a room ID first");
      return;
    }
    try {
      if (watching) {
        unwatch("claude_code", { roomId });
        log(`> unwatch: claude_code (room: ${roomId})`);
        setWatching(false);
      } else {
        watch("claude_code", { roomId });
        log(`> watch: claude_code (room: ${roomId})`);
        setWatching(true);
      }
    } catch (err) {
      log(`Error: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const statusColor =
    status === "connected"
      ? "bg-green-500"
      : status === "connecting"
        ? "bg-yellow-500"
        : "bg-red-500";

  return (
    <div className="absolute top-10 left-0 z-50 w-96 rounded-lg border border-slate-200/50 dark:border-white/10 bg-white dark:bg-zinc-900 shadow-2xl">
      <div className="flex items-center justify-between border-b border-slate-200/50 dark:border-white/10 px-3 py-2">
        <div className="flex items-center gap-2 text-xs font-medium">
          <span className={`h-2 w-2 rounded-full ${statusColor}`} />
          WebSocket: {status}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded p-0.5 text-muted-foreground hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="p-3 space-y-2">
        <p className="text-[10px] text-muted-foreground font-mono truncate">
          Insight: {insightId}
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={isConnected ? close : connect}
            className="rounded-md bg-slate-200/70 dark:bg-zinc-700/50 px-2 py-1 text-xs hover:bg-slate-300/70 dark:hover:bg-zinc-600/50 transition-colors"
          >
            {isConnected ? "Disconnect" : "Connect"}
          </button>
          <button
            type="button"
            onClick={handleSend}
            disabled={!isConnected}
            className="rounded-md bg-blue-600 px-2 py-1 text-xs text-white hover:bg-blue-700 disabled:opacity-40 transition-colors"
          >
            Send MyProjects()
          </button>
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={roomId}
            onChange={(e) => setRoomId(e.target.value)}
            placeholder="Room ID"
            className="flex-1 rounded-md border border-slate-200 dark:border-zinc-700 bg-transparent px-2 py-1 text-xs font-mono"
          />
          <button
            type="button"
            onClick={handleWatch}
            disabled={!isConnected}
            className={`rounded-md px-2 py-1 text-xs text-white transition-colors disabled:opacity-40 ${
              watching
                ? "bg-red-600 hover:bg-red-700"
                : "bg-emerald-600 hover:bg-emerald-700"
            }`}
          >
            {watching ? "Unwatch" : "Watch"}
          </button>
        </div>
        <div className="h-40 overflow-y-auto rounded-md bg-slate-100 dark:bg-zinc-800 p-2 font-mono text-[11px] leading-relaxed">
          {logs.length === 0 && (
            <span className="text-muted-foreground">
              Logs will appear here...
            </span>
          )}
          {logs.map((line, i) => (
            <div key={`${i}-${line}`}>{line}</div>
          ))}
          {lastMessage != null && (
            <div className="mt-1 text-green-600 dark:text-green-400 whitespace-pre-wrap break-all">
              ← {JSON.stringify(lastMessage, null, 2)}
            </div>
          )}
          <div ref={logsEndRef} />
        </div>
      </div>
    </div>
  );
};
