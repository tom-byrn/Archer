/**
 * The dialogs the web's dashboard and account menu open, with the web's
 * words: connect an agent, send feedback, rename and delete a document, start
 * from a sample, a new team workspace, open a share link.
 */

import { useState } from "react";
import { Linking, Platform, Pressable, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import { useMutation } from "convex/react";
import { SAMPLES, type Sample } from "@web/samples";
import { api } from "@/lib/convex";
import { SITE_URL } from "@/lib/env";
import { shareSlugFrom } from "@/lib/links";
import { useTheme } from "@/lib/theme";
import { RADIUS, SHADOW } from "@/lib/tokens";
import { DiagramThumb } from "./Diagram";
import { Icon } from "./Icon";
import { Button, Dialog, DialogActions, Eyebrow, IconButton, Input, TextArea, Txt } from "./ui";

function CopyButton({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <IconButton
      size="sm"
      icon={done ? "check" : "copy"}
      label={done ? "Copied" : label}
      onPress={() => {
        void Clipboard.setStringAsync(text);
        setDone(true);
        setTimeout(() => setDone(false), 1200);
      }}
    />
  );
}

function CommandBox({ text, label, truncate }: { text: string; label: string; truncate?: boolean }) {
  const { palette, mono } = useTheme();
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: truncate ? "center" : "flex-start",
        gap: 8,
        padding: 10,
        borderRadius: RADIUS.md,
        borderWidth: 1,
        borderColor: palette.line,
        backgroundColor: palette.surface2,
      }}
    >
      <Txt size="sm" numberOfLines={truncate ? 1 : undefined} style={{ flex: 1, fontFamily: mono, lineHeight: 19 }} selectable>
        {text}
      </Txt>
      <CopyButton text={text} label={label} />
    </View>
  );
}

export function ConnectAgentDialog({ open, onClose, workspaceName }: { open: boolean; onClose: () => void; workspaceName: string }) {
  const mcpUrl = `${SITE_URL}/mcp`;
  const hosted = `claude mcp add --transport http archer ${mcpUrl}`;
  const cli = SITE_URL === "https://tryarcher.dev" ? "npx archerctl login" : `ARCHER_APP_URL=${SITE_URL} npx archerctl login`;
  const block = (title: string, body: React.ReactNode) => (
    <View style={{ marginTop: 16 }}>
      <View style={{ height: 24, justifyContent: "center" }}>
        <Eyebrow>{title}</Eyebrow>
      </View>
      {body}
    </View>
  );
  return (
    <Dialog open={open} onClose={onClose} title="Connect an agent" width={540}>
      <Txt tone="ink2">
        Agents reach Archer through its MCP server. Add it once and sign in from the browser window your agent opens — no
        keys to copy. The agent gets your access: every workspace you belong to, starting in{" "}
        <Txt weight="500">{workspaceName}</Txt>.
      </Txt>
      {block(
        "Claude Code",
        <>
          <CommandBox text={hosted} label="Copy command" />
          <Txt size="xs" tone="ink3" style={{ paddingTop: 6 }}>
            Then run <Txt size="xs" tone="ink3" mono>/mcp</Txt> in Claude Code, pick <Txt size="xs" tone="ink3" mono>archer</Txt>, and approve the sign-in.
          </Txt>
        </>,
      )}
      {block(
        "Any other MCP client",
        <>
          <CommandBox text={mcpUrl} label="Copy URL" truncate />
          <Txt size="xs" tone="ink3" style={{ paddingTop: 6 }}>
            Add it as a remote (Streamable HTTP) server. Sign-in uses standard MCP OAuth.
          </Txt>
        </>,
      )}
      {block(
        "Command line",
        <>
          <CommandBox text={cli} label="Copy command" />
          <Txt size="xs" tone="ink3" style={{ paddingTop: 6 }}>
            Signs the <Txt size="xs" tone="ink3" mono>archer</Txt> CLI in the same way, for push, pull and list.
          </Txt>
        </>,
      )}
      <Txt size="xs" tone="ink3" style={{ paddingTop: 16, paddingBottom: 4 }}>
        More in the docs:{" "}
        <Txt size="xs" tone="ink2" style={{ textDecorationLine: "underline" }} onPress={() => void Linking.openURL(`${SITE_URL}/docs/mcp`)}>
          MCP server
        </Txt>{" "}
        and{" "}
        <Txt size="xs" tone="ink2" style={{ textDecorationLine: "underline" }} onPress={() => void Linking.openURL(`${SITE_URL}/docs/cli`)}>
          CLI
        </Txt>
        .
      </Txt>
    </Dialog>
  );
}

/** Longest message kept (`convex/feedback.ts` MAX_FEEDBACK). */
const MAX_FEEDBACK = 4000;

export function FeedbackDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { palette } = useTheme();
  const send = useMutation(api.feedback.send);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const close = () => {
    onClose();
    setTimeout(() => {
      setSent(false);
      setMessage("");
      setError(null);
    }, 300);
  };
  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const os = Platform.OS === "ios" ? "iOS" : Platform.OS === "android" ? "Android" : "Web";
      await send({ message, path: "/mobile", device: `Archer app · ${os} ${Platform.Version ?? ""}`.trim() });
      setSent(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open={open} onClose={close} title="Send feedback" width={460}>
      {sent ? (
        <View style={{ alignItems: "center", gap: 8, paddingVertical: 16 }}>
          <Icon name="check-circle" size={24} color={palette.ink2} />
          <Txt>Thanks — your feedback was sent.</Txt>
          <View style={{ paddingTop: 8 }}>
            <Button title="Close" onPress={close} />
          </View>
        </View>
      ) : (
        <>
          <Txt size="sm" tone="ink2" style={{ paddingBottom: 8 }}>
            Something broken, confusing, missing? All feedback is read, new ideas are welcome too!
          </Txt>
          <TextArea value={message} onChangeText={setMessage} maxLength={MAX_FEEDBACK} autoFocus placeholder="What's on your mind?" style={{ minHeight: 120 }} />
          {error && (
            <Txt size="sm" tone="danger" style={{ paddingTop: 8 }}>
              {error}
            </Txt>
          )}
          <DialogActions>
            <Button variant="ghost" title="Cancel" onPress={close} />
            <Button variant="primary" title="Send" icon="send" disabled={message.trim() === "" || busy} onPress={() => void submit()} />
          </DialogActions>
        </>
      )}
    </Dialog>
  );
}

/** Rename, or name a new team workspace: one field and a primary button. */
export function NameDialog({
  title,
  initial,
  submitLabel,
  placeholder,
  onClose,
  onSave,
}: {
  title: string;
  initial: string;
  submitLabel: string;
  placeholder?: string;
  onClose: () => void;
  onSave: (name: string) => Promise<void>;
}) {
  const [name, setName] = useState(initial);
  const [busy, setBusy] = useState(false);
  const trimmed = name.trim();
  const submit = () => {
    if (trimmed === "" || busy) return;
    setBusy(true);
    void onSave(trimmed)
      .then(onClose)
      .finally(() => setBusy(false));
  };
  return (
    <Dialog open onClose={onClose} title={title} width={400}>
      <Input value={name} onChangeText={setName} autoFocus placeholder={placeholder} returnKeyType="done" onSubmitEditing={submit} />
      <DialogActions>
        <Button variant="ghost" title="Cancel" onPress={onClose} />
        <Button variant="primary" title={submitLabel} disabled={trimmed === "" || busy} onPress={submit} />
      </DialogActions>
    </Dialog>
  );
}

/** A destructive confirmation: the web's Delete and Leave dialogs. */
export function ConfirmDialog({
  title,
  body,
  confirmLabel,
  onClose,
  onConfirm,
}: {
  title: string;
  body: React.ReactNode;
  confirmLabel: string;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open onClose={onClose} title={title} width={420}>
      <Txt tone="ink2">{body}</Txt>
      <DialogActions>
        <Button variant="ghost" title="Cancel" onPress={onClose} />
        <Button
          variant="danger"
          title={confirmLabel}
          disabled={busy}
          onPress={() => {
            setBusy(true);
            void onConfirm()
              .then(onClose)
              .finally(() => setBusy(false));
          }}
        />
      </DialogActions>
    </Dialog>
  );
}

/** "Start from a sample": the dashboard's gallery, one card per sample. */
export function SampleDialog({
  workspaceName,
  onClose,
  onChoose,
}: {
  workspaceName: string;
  onClose: () => void;
  onChoose: (s: Sample) => Promise<void>;
}) {
  const { palette } = useTheme();
  const [creating, setCreating] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  return (
    <Dialog open onClose={onClose} title="Start from a sample" width={800}>
      <Txt size="sm" tone="ink2" style={{ paddingBottom: 12 }}>
        Pick one to copy into <Txt size="sm" weight="500">{workspaceName}</Txt> as a new document.
      </Txt>
      <View style={{ gap: 12 }}>
        {SAMPLES.map((s) => (
          <Pressable
            key={s.slug}
            disabled={creating !== null}
            onPress={() => {
              setCreating(s.slug);
              setFailed(false);
              onChoose(s).catch(() => {
                setCreating(null);
                setFailed(true);
              });
            }}
            style={({ pressed }) => [
              {
                borderRadius: RADIUS.md,
                borderWidth: 1,
                borderColor: pressed ? palette.line2 : palette.line,
                backgroundColor: palette.surface,
                overflow: "hidden",
                opacity: creating !== null && creating !== s.slug ? 0.4 : 1,
              },
              pressed && SHADOW.md,
            ]}
          >
            <View style={{ backgroundColor: palette.ground, borderBottomWidth: 1, borderBottomColor: palette.line }}>
              <DiagramThumb source={s.source} height={150} />
            </View>
            <View style={{ paddingHorizontal: 12, paddingVertical: 10 }}>
              <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8 }}>
                <Txt weight="500" numberOfLines={1} style={{ flex: 1 }}>
                  {s.title}
                </Txt>
                {creating === s.slug && (
                  <Txt size="xs" tone="ink3">
                    Creating…
                  </Txt>
                )}
              </View>
              <Txt size="xs" tone="ink2" numberOfLines={2} style={{ paddingTop: 2 }}>
                {s.description}
              </Txt>
            </View>
          </Pressable>
        ))}
      </View>
      {failed && (
        <Txt size="sm" tone="danger" style={{ paddingTop: 12 }}>
          Couldn't create it. Try again.
        </Txt>
      )}
    </Dialog>
  );
}

/** Open a share link someone sent (no account needed). */
export function OpenLinkDialog({ onClose, onOpen }: { onClose: () => void; onOpen: (slug: string) => void }) {
  const [text, setText] = useState("");
  const slug = shareSlugFrom(text);
  return (
    <Dialog open onClose={onClose} title="Open a share link" width={440}>
      <Txt size="sm" tone="ink2" style={{ paddingBottom: 8 }}>
        Paste a link to a shared document. It opens read-only, signed in or not.
      </Txt>
      <View style={{ flexDirection: "row", gap: 8 }}>
        <Input
          value={text}
          onChangeText={setText}
          placeholder="https://tryarcher.dev/share/…"
          autoCapitalize="none"
          keyboardType="url"
          autoFocus
          returnKeyType="go"
          onSubmitEditing={() => slug && onOpen(slug)}
          invalid={text.trim() !== "" && !slug}
          style={{ flex: 1 }}
        />
        <Button title="Paste" icon="paste" onPress={() => void Clipboard.getStringAsync().then(setText)} />
      </View>
      {text.trim() !== "" && !slug && (
        <Txt size="xs" tone="danger" style={{ paddingTop: 6 }}>
          That isn't an Archer share link.
        </Txt>
      )}
      <DialogActions>
        <Button variant="ghost" title="Cancel" onPress={onClose} />
        <Button variant="primary" title="Open" disabled={!slug} onPress={() => slug && onOpen(slug)} />
      </DialogActions>
    </Dialog>
  );
}
