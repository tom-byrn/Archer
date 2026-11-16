/**
 * The web's Share dialog: "Anyone with the link can view" with its switch,
 * then the link and the README embeds, each with a copy button. On a phone the
 * link also goes to the system share sheet.
 */

import { useEffect, useState } from "react";
import { View } from "react-native";
import * as Clipboard from "expo-clipboard";
import { useMutation } from "convex/react";
import { api, type Id } from "@/lib/convex";
import { SITE_URL } from "@/lib/env";
import { shareUrl } from "@/lib/links";
import { shareLink } from "@/lib/share";
import { useTheme } from "@/lib/theme";
import { RADIUS } from "@/lib/tokens";
import { Dialog, Eyebrow, IconButton, Switch, Txt } from "./ui";

const EMBED_THEMES = [
  { label: "Light", query: "" },
  { label: "Dark", query: "?theme=dark" },
] as const;

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

export function ShareDialog({
  open,
  onClose,
  title,
  documentId,
  workspaceId,
  publicSlug,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  documentId: Id<"documents">;
  workspaceId: string;
  publicSlug: string | undefined;
}) {
  const { palette, mono } = useTheme();
  const setPublic = useMutation(api.documents.setPublic);
  const [slug, setSlug] = useState<string | null>(publicSlug ?? null);
  const [busy, setBusy] = useState(false);
  useEffect(() => setSlug(publicSlug ?? null), [publicSlug]);
  const toggle = async (enabled: boolean) => {
    if (busy) return;
    setBusy(true);
    try {
      setSlug(await setPublic({ id: documentId, workspaceId, enabled }));
    } finally {
      setBusy(false);
    }
  };
  const link = slug ? shareUrl(SITE_URL, slug) : "";
  const box = { borderRadius: RADIUS.md, borderWidth: 1, borderColor: palette.line } as const;
  return (
    <Dialog open={open} onClose={onClose} title="Share" width={520}>
      <View style={[box, { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 12, paddingVertical: 10 }]}>
        <View style={{ flex: 1 }}>
          <Txt weight="500">Anyone with the link can view</Txt>
          <Txt size="xs" tone="ink3">
            Read-only canvas and code. No sign-in needed.
          </Txt>
        </View>
        <Switch on={slug !== null} onChange={(v) => void toggle(v)} label="Public link" disabled={busy} />
      </View>
      {slug && (
        <>
          <View style={{ height: 24, justifyContent: "center", marginTop: 16 }}>
            <Eyebrow>Link</Eyebrow>
          </View>
          <View style={[box, { flexDirection: "row", alignItems: "center", gap: 6, paddingLeft: 10, paddingRight: 4, paddingVertical: 4, backgroundColor: palette.surface2 }]}>
            <Txt size="sm" numberOfLines={1} style={{ flex: 1, fontFamily: mono }}>
              {link}
            </Txt>
            <CopyButton text={link} label="Copy link" />
            <IconButton size="sm" icon="share" label="Share link" onPress={() => void shareLink(title, link)} />
          </View>
          <View style={{ height: 24, justifyContent: "center", marginTop: 16 }}>
            <Eyebrow>Embed in a README</Eyebrow>
          </View>
          <View style={[box, { backgroundColor: palette.surface2 }]}>
            {EMBED_THEMES.map(({ label, query }, i) => {
              const embed = `![Architecture](${link}/image.svg${query})`;
              return (
                <View
                  key={label}
                  style={{
                    flexDirection: "row",
                    alignItems: "flex-start",
                    gap: 8,
                    paddingLeft: 10,
                    paddingRight: 4,
                    paddingVertical: 6,
                    borderTopWidth: i === 0 ? 0 : 1,
                    borderTopColor: palette.line,
                  }}
                >
                  <Txt size="sm" weight="500" tone="ink2" style={{ width: 36 }}>
                    {label}
                  </Txt>
                  <Txt size="sm" style={{ flex: 1, fontFamily: mono }}>
                    {/* Breaks anywhere, as the web's break-all: a URL has no spaces to wrap at. */}
                    {embed.replace(/([/?=&.()-])/g, "$1\u200B")}
                  </Txt>
                  <CopyButton text={embed} label={`Copy ${label.toLowerCase()} embed`} />
                </View>
              );
            })}
          </View>
          <Txt size="xs" tone="ink3" style={{ paddingTop: 8 }}>
            The image re-renders on every save.
          </Txt>
        </>
      )}
    </Dialog>
  );
}
