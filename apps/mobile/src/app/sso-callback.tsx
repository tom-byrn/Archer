import { Redirect } from "expo-router";

/** Where GitHub sign-in returns if the system opens the link rather than the auth session. */
export default function SsoCallback() {
  return <Redirect href="/" />;
}
