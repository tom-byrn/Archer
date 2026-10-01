"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { describeDevice } from "./UsageBeacon";
import { Button, Dialog, Icon, TextArea } from "./ui";

/** convex/feedback.ts keeps this much. */
const MAX_FEEDBACK = 4000;

/**
 * "Send feedback" from the dashboard: a message to the admin, who reads it on
 * the admin dashboard's Feedback tab with who sent it and from where.
 */
export function FeedbackDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const send = useMutation(api.feedback.send);
  const pathname = usePathname();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const trimmed = message.trim();

  const close = () => {
    onClose();
    if (sent) {
      setSent(false);
      setMessage("");
    }
    setError(null);
  };

  const submit = async () => {
    if (trimmed === "" || busy) return;
    setBusy(true);
    setError(null);
    try {
      await send({ message: trimmed, path: pathname, device: describeDevice(navigator.userAgent) });
      setSent(true);
    } catch {
      setError("Couldn't send your feedback. Try again in a moment.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={close} title="Send feedback" width={460}>
      {sent ? (
        <div className="flex flex-col items-center gap-2 py-4 text-center">
          <Icon.CheckCircle className="h-6 w-6 text-ink-2" />
          <p className="text-base text-ink">Thanks — your feedback was sent.</p>
          <div className="pt-2">
            <Button onClick={close}>Close</Button>
          </div>
        </div>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <p className="pb-2 text-sm text-ink-2">
            Something broken, confusing or missing? Ideas welcome too.
          </p>
          <TextArea
            value={message}
            autoFocus
            rows={6}
            maxLength={MAX_FEEDBACK}
            spellCheck
            placeholder="What's on your mind?"
            aria-label="Feedback"
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                void submit();
              }
            }}
          />
          {error && <p className="pt-2 text-sm text-danger">{error}</p>}
          <div className="flex justify-end gap-2 pt-3">
            <Button variant="ghost" onClick={close}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" icon={<Icon.Send />} disabled={trimmed === "" || busy}>
              Send
            </Button>
          </div>
        </form>
      )}
    </Dialog>
  );
}
