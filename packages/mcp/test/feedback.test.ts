import { afterEach, describe, expect, it } from "vitest";
import { connectInProcess } from "../scripts/inProcess";
import { db } from "../src/backend";
import { createFakeBackend } from "./fakeBackend";

// send_feedback stores the message as the signed-in user, like the app's
// "Send feedback", with the agent's name where the app puts the device.

process.env.ARCHER_SERVICE_SECRET ??= "test-service-secret";

const USER = "user_feedback1";

let close: (() => Promise<void>) | undefined;
afterEach(async () => {
  await close?.();
  close = undefined;
});

async function connect() {
  const fake = createFakeBackend();
  Object.assign(db, fake.db);
  const mcp = await connectInProcess({ userId: USER, agentName: "Claude Code" });
  close = () => mcp.client.close();
  return { fake, mcp };
}

describe("send_feedback", () => {
  it("sends the trimmed message as the user, labelled with the agent", async () => {
    const { fake, mcp } = await connect();
    const res = await mcp.call("send_feedback", { message: "  The layout button is hard to find.\n" });
    expect(res.isError, res.text).toBe(false);
    expect(res.json).toMatchObject({ sent: true, characters: 34 });
    expect(fake.state.feedback).toEqual([
      { userId: USER, message: "The layout button is hard to find.", path: "/mcp", device: "Claude Code" },
    ]);
  });

  it("refuses an empty or overlong message", async () => {
    const { fake, mcp } = await connect();
    expect((await mcp.call("send_feedback", { message: "   " })).isError).toBe(true);
    expect((await mcp.call("send_feedback", { message: "x".repeat(4001) })).isError).toBe(true);
    expect(fake.state.feedback).toEqual([]);
  });

  it("needs a verified user", async () => {
    const { fake, mcp } = await connect();
    mcp.dropAuth();
    const res = await mcp.call("send_feedback", { message: "Hello" });
    expect(res.isError).toBe(true);
    expect(res.text).toContain("Not authenticated");
    expect(fake.state.feedback).toEqual([]);
  });
});
