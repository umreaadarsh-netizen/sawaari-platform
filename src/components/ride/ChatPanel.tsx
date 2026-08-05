import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import { Send, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function ChatPanel({
  rideId,
  selfUserId,
  className,
}: {
  rideId: Id<"rides">;
  selfUserId: string;
  className?: string;
}) {
  const messages = useQuery(api.rides.listMessages, { rideId });
  const sendMessage = useMutation(api.rides.sendMessage);
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages?.length]);

  const handleSend = async () => {
    const text = draft.trim();
    if (!text) return;
    setSending(true);
    try {
      await sendMessage({ rideId, body: text });
      setDraft("");
    } catch {
      // ignore — will surface on next attempt
    }
    setSending(false);
  };

  return (
    <div className={cn("flex min-h-0 flex-col", className)}>
      <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          In-ride chat
        </p>
        <span className="flex items-center gap-1.5 text-[10px] font-medium text-emerald-300">
          <Zap className="size-3" /> live
        </span>
      </div>

      <div
        ref={scrollRef}
        className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-3"
      >
        {(messages ?? []).map((m) => {
          const mine = m.authorId === selfUserId;
          return (
            <div
              key={m._id}
              className={cn("flex", mine ? "justify-end" : "justify-start")}
            >
              <div
                className={cn(
                  "max-w-[80%] rounded-2xl px-3 py-2 text-[13px] leading-snug",
                  mine
                    ? "rounded-br-sm bg-emerald-400/20 text-emerald-50 ring-1 ring-emerald-400/25"
                    : "rounded-bl-sm bg-white/8 text-slate-200 ring-1 ring-white/10",
                )}
              >
                {!mine && (
                  <p className="mb-0.5 text-[10px] font-semibold text-emerald-300">
                    {m.authorName}
                  </p>
                )}
                <p className="break-words">{m.body}</p>
              </div>
            </div>
          );
        })}
        {messages?.length === 0 && (
          <p className="pt-6 text-center text-xs text-slate-500">
            Messages between you and your driver appear here.
          </p>
        )}
      </div>

      <div className="flex items-center gap-2 border-t border-white/10 p-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void handleSend();
            }
          }}
          placeholder="Message…"
          className="h-9 border-white/10 bg-white/5 text-[13px] text-slate-200 placeholder:text-slate-500"
        />
        <Button
          type="button"
          size="icon"
          onClick={() => void handleSend()}
          disabled={!draft.trim() || sending}
          className="shrink-0 bg-emerald-500 text-emerald-950 hover:bg-emerald-400"
          aria-label="Send message"
        >
          <Send className="size-4" />
        </Button>
      </div>
    </div>
  );
}
