/**
 * A document's header menu: share it, open it on the web, save a copy of an
 * example or shared document, delete one of your own.
 */

import { useState } from "react";
import { Alert, Linking } from "react-native";
import { useRouter, type Href } from "expo-router";
import * as Clipboard from "expo-clipboard";
import { useMutation } from "convex/react";
import { useAccount } from "@/lib/auth";
import { api, canEdit } from "@/lib/convex";
import { useDoc } from "@/lib/doc";
import { SITE_URL } from "@/lib/env";
import { shareUrl } from "@/lib/links";
import { useWorkspace } from "@/lib/workspace";
import { shareLink } from "@/lib/share";
import { Sheet, type SheetAction } from "./Sheet";
import { IconButton } from "./ui";

export function DocActions() {
  const d = useDoc();
  const { isSignedIn } = useAccount();
  if (d.kind === "document") return <StoredActions />;
  return isSignedIn ? <PublicActionsWithCopy /> : <PublicActions />;
}

function Menu({ actions, title }: { actions: SheetAction[]; title: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <IconButton icon="dots-three" label="Document actions" onPress={() => setOpen(true)} />
      <Sheet visible={open} title={title} actions={actions} onClose={() => setOpen(false)} />
    </>
  );
}

const alertError = (title: string) => (e: unknown) =>
  Alert.alert(title, e instanceof Error ? e.message : String(e));

function StoredActions() {
  const d = useDoc();
  const router = useRouter();
  const setPublic = useMutation(api.documents.setPublic);
  const remove = useMutation(api.documents.remove);
  const actions: SheetAction[] = [];

  if (d.publicSlug) {
    const url = shareUrl(SITE_URL, d.publicSlug);
    actions.push(
      { label: "Share link", icon: "export", onPress: () => void shareLink(d.title, url) },
      { label: "Copy link", icon: "link", onPress: () => void Clipboard.setStringAsync(url) },
    );
    if (d.editable)
      actions.push({
        label: "Stop sharing",
        icon: "lock",
        onPress: () =>
          Alert.alert("Stop sharing?", "The link stops working for everyone who has it.", [
            { text: "Cancel", style: "cancel" },
            {
              text: "Stop sharing",
              style: "destructive",
              onPress: () =>
                void setPublic({ id: d.documentId!, workspaceId: d.workspaceId!, enabled: false }).catch(
                  alertError("Couldn't stop sharing"),
                ),
            },
          ]),
      });
  } else if (d.editable) {
    actions.push({
      label: "Create share link",
      icon: "link",
      onPress: () =>
        void setPublic({ id: d.documentId!, workspaceId: d.workspaceId!, enabled: true })
          .then((slug) => {
            if (slug) return shareLink(d.title, shareUrl(SITE_URL, slug));
          })
          .catch(alertError("Couldn't create a link")),
    });
  }
  actions.push({
    label: "Open on the web",
    icon: "arrow-square-out",
    onPress: () => void Linking.openURL(`${SITE_URL}/documents/${d.documentId}`),
  });
  if (d.editable)
    actions.push({
      label: "Delete document",
      icon: "trash",
      destructive: true,
      onPress: () =>
        Alert.alert(`Delete “${d.title}”?`, "This deletes the document and its history for everyone in the workspace.", [
          { text: "Cancel", style: "cancel" },
          {
            text: "Delete",
            style: "destructive",
            onPress: () =>
              void remove({ id: d.documentId!, workspaceId: d.workspaceId! })
                .then(() => router.dismissTo("/"))
                .catch(alertError("Couldn't delete it")),
          },
        ]),
    });
  return <Menu title={d.title} actions={actions} />;
}

function PublicActions({ saveCopy }: { saveCopy?: () => void }) {
  const d = useDoc();
  const actions: SheetAction[] = [];
  if (d.kind === "share" && d.publicSlug) {
    const url = shareUrl(SITE_URL, d.publicSlug);
    actions.push(
      { label: "Share link", icon: "export", onPress: () => void shareLink(d.title, url) },
      { label: "Open on the web", icon: "arrow-square-out", onPress: () => void Linking.openURL(url) },
    );
  } else {
    const slug = d.base.split("/").pop();
    actions.push({
      label: "Open in the web sandbox",
      icon: "arrow-square-out",
      onPress: () => void Linking.openURL(`${SITE_URL}/sandbox/${slug}`),
    });
  }
  if (saveCopy) actions.push({ label: "Save a copy to my workspace", icon: "plus", onPress: saveCopy });
  return <Menu title={d.title} actions={actions} />;
}

/** Signed in: a copy can be saved into the selected workspace (editors and owners). */
function PublicActionsWithCopy() {
  const d = useDoc();
  const router = useRouter();
  const { workspaceId, role } = useWorkspace();
  const create = useMutation(api.documents.create);
  const saveCopy =
    workspaceId && canEdit(role)
      ? () =>
          void create({ workspaceId, title: d.title, source: d.source })
            .then((id) => router.push(`/documents/${id}` as Href))
            .catch(alertError("Couldn't save a copy"))
      : undefined;
  return <PublicActions saveCopy={saveCopy} />;
}
