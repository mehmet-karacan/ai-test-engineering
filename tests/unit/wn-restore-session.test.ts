import { describe, expect, it } from "vitest";
import { parseRestoreSnapshot, startWindowsRestoreMoveSession } from "../../src/storage/windows-restore-session.js";

const identity = { volumeSerial: "a".repeat(16), fileId: "b".repeat(32), bytes: 12, sha256: "c".repeat(64) };

describe("S01 native restore session protocol", () => {
  it("rejects ambiguous or oversized native file identities", () => {
    expect(parseRestoreSnapshot(`${identity.volumeSerial}:${identity.fileId}:12:${identity.sha256}`)).toEqual(identity);
    for (const value of [
      `${identity.volumeSerial}:${identity.fileId}:012:${identity.sha256}`,
      `${identity.volumeSerial}:${identity.fileId}:9007199254740992:${identity.sha256}`,
      `${identity.volumeSerial}:${identity.fileId}:-1:${identity.sha256}`,
      `${identity.volumeSerial}:${identity.fileId}:12:${"d".repeat(63)}`,
    ]) expect(() => parseRestoreSnapshot(value)).toThrow(/Windows restore session protocol/);
  });

  it("rejects a non-component staged path before spawning a helper", async () => {
    await expect(startWindowsRestoreMoveSession({ path: "missing", sha256: "0".repeat(64) }, {
      dbDirectory: "C:\\owned", dbName: "state.db", stagedName: "..\\outside.db",
      preservedSuffix: ".restore-old-test", generation: "generation-test",
      expected: { oldDb: identity, stagedDb: identity },
    })).rejects.toMatchObject({ details: { reason_code: "WINDOWS_RESTORE_SESSION_PROTOCOL" } });
  });
});
