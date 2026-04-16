import { parseTranscriptMessage } from "@/lib/parseTranscriptMessage";
import { useAppDispatch } from "@/store";
import { addTranscriptEvent } from "@/store/slices/transcriptSlice";
import { useInsight, useWebSocket } from "@semoss/sdk/react";
import { useCallback, useEffect, useRef } from "react";

/**
 * Manages the websocket watch/unwatch lifecycle for transcript events.
 *
 * Call `startWatching(roomId)` before dispatching RunAgent and
 * `stopWatching()` when the agent completes (fulfilled or rejected).
 *
 * Incoming messages are automatically parsed and dispatched to the
 * transcript slice. The transcript is cleared on each new watch.
 */
export const useTranscriptStream = () => {
  const dispatch = useAppDispatch();
  const { insightId } = useInsight();
  const { watch, unwatch, lastMessage, isConnected, status, connect } =
    useWebSocket(insightId);

  const activeRoomIdRef = useRef<string | null>(null);
  const processedMessagesRef = useRef(0);

  // Log connection status changes
  useEffect(() => {
    console.debug(
      `[transcript] WebSocket status: ${status} (isConnected=${isConnected})`,
    );
  }, [status, isConnected]);

  // If we have a pending room to watch and just became connected, send the watch now
  const pendingRoomIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (isConnected && pendingRoomIdRef.current) {
      const roomId = pendingRoomIdRef.current;
      pendingRoomIdRef.current = null;
      try {
        watch("claude_code", { roomId });
        activeRoomIdRef.current = roomId;
        console.debug(`[transcript] Deferred watch sent for room ${roomId}`);
      } catch (error) {
        console.error("[transcript] Failed deferred watch:", error);
      }
    }
  }, [isConnected, watch]);

  // Process incoming messages whenever lastMessage changes
  useEffect(() => {
    // Skip if no active watch
    if (!activeRoomIdRef.current) return;
    if (lastMessage == null) return;

    processedMessagesRef.current += 1;
    console.log(
      `[transcript] Raw WS message #${processedMessagesRef.current}:`,
      lastMessage,
    );

    const events = parseTranscriptMessage(lastMessage);
    for (const event of events) {
      console.log("[transcript] Parsed event:", event.kind, event);
      dispatch(addTranscriptEvent(event));
    }
  }, [lastMessage, dispatch]);

  const startWatching = useCallback(
    (roomId: string) => {
      // Don't clear the transcript here — we want prior events to persist
      // across consecutive messages in the same room. Clearing happens via
      // the transcriptSlice's `startNewRoom` extraReducer.
      processedMessagesRef.current = 0;

      console.log(
        `[transcript] startWatching called for room ${roomId} (isConnected=${isConnected}, status=${status})`,
      );

      // Unwatch previous room if still active
      if (activeRoomIdRef.current) {
        try {
          unwatch("claude_code", {
            roomId: activeRoomIdRef.current,
          });
        } catch {
          // ignore
        }
        activeRoomIdRef.current = null;
      }

      if (!isConnected) {
        // Queue the watch — the useEffect above will send it once connected
        console.warn(
          `[transcript] WebSocket not connected yet, queuing watch for room ${roomId}`,
        );
        pendingRoomIdRef.current = roomId;
        connect();
        return;
      }

      try {
        watch("claude_code", { roomId });
        activeRoomIdRef.current = roomId;
        console.debug(`[transcript] Watching room ${roomId}`);
      } catch (error) {
        console.error("[transcript] Failed to watch room:", error);
      }
    },
    [isConnected, status, watch, unwatch, connect],
  );

  const stopWatching = useCallback(() => {
    pendingRoomIdRef.current = null;

    if (!activeRoomIdRef.current) return;

    const roomId = activeRoomIdRef.current;
    activeRoomIdRef.current = null;

    console.log(
      `[transcript] Unwatching room ${roomId} (processed ${processedMessagesRef.current} messages)`,
    );

    if (!isConnected) return;

    try {
      unwatch("claude_code", { roomId });
    } catch {
      // ignore — connection may have dropped
    }
  }, [isConnected, unwatch]);

  return { startWatching, stopWatching };
};
