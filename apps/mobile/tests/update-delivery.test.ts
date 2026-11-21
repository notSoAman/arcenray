import assert from "node:assert/strict";
import test from "node:test";
import { downloadAppUpdate } from "../src/update-delivery.ts";
test("available compatible updates download without reloading or interrupting the app", async () => {
  let fetched = 0;
  assert.equal(
    await downloadAppUpdate({
      isEnabled: true,
      checkForUpdateAsync: async () => ({ isAvailable: true }),
      fetchUpdateAsync: async () => {
        fetched++;
      },
    }),
    true,
  );
  assert.equal(fetched, 1);
});
test("offline errors and development clients never block opening the app", async () => {
  const api = {
    isEnabled: false,
    checkForUpdateAsync: async () => {
      throw Error("offline");
    },
    fetchUpdateAsync: async () => {
      throw Error("unexpected");
    },
  };
  assert.equal(await downloadAppUpdate(api), false);
  assert.equal(await downloadAppUpdate({ ...api, isEnabled: true }), false);
});
test("a rollback directive is downloaded even though it is not a new update", async () => {
  let fetched = 0;
  assert.equal(
    await downloadAppUpdate({
      isEnabled: true,
      checkForUpdateAsync: async () => ({
        isAvailable: false,
        isRollBackToEmbedded: true,
      }),
      fetchUpdateAsync: async () => {
        fetched++;
      },
    }),
    true,
  );
  assert.equal(fetched, 1);
});

test("a fast startup download can apply before forms are opened", async () => {
  const { prepareStartupUpdate } = await import("../src/update-delivery.ts");
  assert.equal(
    await prepareStartupUpdate({
      isEnabled: true,
      checkForUpdateAsync: async () => ({ isAvailable: true }),
      fetchUpdateAsync: async () => {},
    }),
    true,
  );
});
test("a slow download never blocks startup past its budget", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { prepareStartupUpdate } = await import("../src/update-delivery.ts");
  let finish!: () => void;
  const delayed = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const pending = prepareStartupUpdate(
    {
      isEnabled: true,
      checkForUpdateAsync: async () => ({ isAvailable: true }),
      fetchUpdateAsync: () => delayed,
    },
    100,
  );
  t.mock.timers.tick(101);
  assert.equal(await pending, false);
  finish();
});
