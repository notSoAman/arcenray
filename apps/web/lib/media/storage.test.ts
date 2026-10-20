import test from "node:test";
import assert from "node:assert/strict";
import { canReserveStorage } from "./storage.ts";
test("explicit unlimited account cap permits usage beyond 2 GiB", () => {
  assert.equal(
    canReserveStorage(
      {
        quota_bytes: null,
        used_bytes: 8 * 1024 ** 3,
        reserved_bytes: 2 * 1024 ** 3,
      },
      2 * 1024 ** 3,
    ),
    true,
  );
});
test("finite administrative caps still include reserved bytes", () => {
  assert.equal(
    canReserveStorage(
      { quota_bytes: 100, used_bytes: 40, reserved_bytes: 20 },
      40,
    ),
    true,
  );
  assert.equal(
    canReserveStorage(
      { quota_bytes: 100, used_bytes: 40, reserved_bytes: 20 },
      41,
    ),
    false,
  );
  assert.equal(
    canReserveStorage({ quota_bytes: 0, used_bytes: 0, reserved_bytes: 0 }, 1),
    false,
  );
});
test("missing or malformed quota is not treated as unlimited", () => {
  for (const storage of [
    { used_bytes: 0, reserved_bytes: 0 },
    { quota_bytes: "unlimited", used_bytes: 0, reserved_bytes: 0 },
    { quota_bytes: null, used_bytes: -1, reserved_bytes: 0 },
    null,
  ])
    assert.throws(
      () => canReserveStorage(storage, 1),
      /Invalid storage response/,
    );
});
