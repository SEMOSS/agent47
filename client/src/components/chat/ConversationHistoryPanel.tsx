import { Check, History, Pencil, Plus, X } from "lucide-react";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useAppContext } from "@/contexts/AppContext";
import { cn } from "@/lib/utils";
import { useAppDispatch, useAppSelector } from "@/store";
import { startNewRoom } from "@/store/slices/chatSlice";
import {
  loadConversationHistory,
  renameConversationRoom,
  resumeConversation,
} from "@/store/thunks/conversationHistory";

const formatSessionDate = (value: string) => {
  if (!value) return "";

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;

  return parsed.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

export const ConversationHistoryPanel = () => {
  const dispatch = useAppDispatch();
  const { runPixel } = useAppContext();
  const [open, setOpen] = useState(false);
  const [editingRoomId, setEditingRoomId] = useState<string | null>(null);
  const [draftRoomName, setDraftRoomName] = useState("");
  const [isRenaming, setIsRenaming] = useState(false);

  const projectId = useAppSelector((state) => state.chat.projectId);
  const activeRoomId = useAppSelector((state) => state.chat.roomId);
  const conversationList = useAppSelector(
    (state) => state.chat.conversationList,
  );
  const isLoading = useAppSelector(
    (state) => state.chat.isLoadingConversations,
  );

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      setOpen(nextOpen);
      if (nextOpen && projectId) {
        void dispatch(loadConversationHistory({ projectId, runPixel }));
      }
    },
    [dispatch, projectId, runPixel],
  );

  const handleNewConversation = useCallback(() => {
    dispatch(startNewRoom());
    setEditingRoomId(null);
    setDraftRoomName("");
    setOpen(false);
  }, [dispatch]);

  const handleResume = useCallback(
    (roomId: string) => {
      if (!projectId) {
        return;
      }

      void dispatch(resumeConversation({ roomId, projectId, runPixel }));
      setEditingRoomId(null);
      setDraftRoomName("");
      setOpen(false);
    },
    [dispatch, projectId, runPixel],
  );

  const handleStartEditing = useCallback(
    (roomId: string, roomName: string) => {
      setEditingRoomId(roomId);
      setDraftRoomName(roomName);
    },
    [],
  );

  const handleCancelEditing = useCallback(() => {
    setEditingRoomId(null);
    setDraftRoomName("");
  }, []);

  const handleRename = useCallback(
    async (roomId: string) => {
      const trimmedRoomName = draftRoomName.trim();
      if (!trimmedRoomName) {
        toast.error("Room name cannot be empty.");
        return;
      }

      setIsRenaming(true);
      try {
        await dispatch(
          renameConversationRoom({
            roomId,
            roomName: trimmedRoomName,
            runPixel,
          }),
        ).unwrap();
        toast.success("Conversation renamed.");
        setEditingRoomId(null);
        setDraftRoomName("");
      } catch (error) {
        console.error("Failed to rename room:", error);
        toast.error("Could not rename conversation.");
      } finally {
        setIsRenaming(false);
      }
    },
    [dispatch, draftRoomName, runPixel],
  );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          title="Conversation history"
          disabled={!projectId}
        >
          <History className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Conversation History</DialogTitle>
          <DialogDescription>
            Reopen a previous room for this project.
          </DialogDescription>
        </DialogHeader>

        <Button
          variant="outline"
          size="sm"
          className="w-full justify-start gap-2"
          onClick={handleNewConversation}
        >
          <Plus className="h-3.5 w-3.5" />
          New conversation
        </Button>

        <div className="max-h-72 overflow-y-auto rounded-lg border border-border/60">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground" />
            </div>
          ) : conversationList.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">
              No previous sessions for this project.
            </p>
          ) : (
            conversationList.map((room) => {
              const isActive = room.roomId === activeRoomId;
              const isEditing = editingRoomId === room.roomId;

              return (
                <div
                  key={room.roomId}
                  onClick={() => handleResume(room.roomId)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      handleResume(room.roomId);
                    }
                  }}
                  role="button"
                  tabIndex={0}
                  className={cn(
                    "flex w-full flex-col items-start gap-2 border-b border-border/60 px-3 py-2.5 text-left text-sm transition hover:bg-accent/50 last:border-b-0",
                    isActive && "bg-accent/70",
                  )}
                >
                  <div className="flex w-full items-start gap-2">
                    {isEditing ? (
                      <Input
                        value={draftRoomName}
                        onChange={(event) => setDraftRoomName(event.target.value)}
                        onClick={(event) => event.stopPropagation()}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            event.stopPropagation();
                            void handleRename(room.roomId);
                          }
                          if (event.key === "Escape") {
                            event.preventDefault();
                            event.stopPropagation();
                            handleCancelEditing();
                          }
                        }}
                        autoFocus
                        className="h-8"
                        disabled={isRenaming}
                      />
                    ) : (
                      <span className="line-clamp-2 flex-1 font-medium leading-snug">
                        {room.roomName}
                      </span>
                    )}

                    {isEditing ? (
                      <div
                        className="flex items-center gap-1"
                        onClick={(event) => event.stopPropagation()}
                      >
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => void handleRename(room.roomId)}
                          disabled={isRenaming}
                          title="Save room name"
                        >
                          <Check className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          onClick={handleCancelEditing}
                          disabled={isRenaming}
                          title="Cancel rename"
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ) : (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className="shrink-0"
                        title="Rename conversation"
                        onClick={(event) => {
                          event.stopPropagation();
                          handleStartEditing(room.roomId, room.roomName);
                        }}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {formatSessionDate(room.dateCreated)}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
