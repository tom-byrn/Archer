import { Redirect } from "expo-router";
import { Empty } from "@/components/ui";
import { useAccount } from "@/lib/auth";
import { DocumentsScreen } from "@/screens/DocumentsScreen";

/** Signed in: your documents. Otherwise the welcome screen. */
export default function Index() {
  const account = useAccount();
  if (!account.isLoaded) return <Empty loading />;
  if (!account.isSignedIn) return <Redirect href="/welcome" />;
  return <DocumentsScreen />;
}
