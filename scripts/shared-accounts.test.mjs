import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdir, mkdtemp } from "node:fs/promises";
import { resolve } from "node:path";
import { randomBytes } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import {
  startNativeStack,
  root,
  freePort,
} from "../../cards/scripts/split-stack.mjs";

test(
  "Golf shares real login, profile, and logout with Cards, Hearts, and Euchre",
  { timeout: 90000 },
  async () => {
    await mkdir(resolve(root, ".local"), { recursive: true });
    const directory = await mkdtemp(
      resolve(root, ".local/split-golf-accounts-")
    );
    const webPorts = Object.fromEntries(
      await Promise.all(
        ["hearts", "euchre", "golf"].map(async (role) => [
          role,
          await freePort(),
        ])
      )
    );
    let stack;
    try {
      stack = await startNativeStack({ directory, web: true, webPorts });
      const bases = [
        stack.base("gateway"),
        ...["golf", "hearts", "euchre"].map((role) => stack.webBase(role)),
      ];
      let cookie = "",
        csrf = "";
      async function request(base, path, data, expected = 200) {
        const response = await fetch(base + "/api/account/" + path, {
          method: data === undefined ? "GET" : "POST",
          headers: {
            Cookie: cookie,
            Origin: base.replace("127.0.0.1", "localhost"),
            "X-CSRF-Token": csrf,
            "Content-Type": "application/json",
          },
          ...(data === undefined ? {} : { body: JSON.stringify(data) }),
        });
        cookie = response.headers.get("set-cookie")?.split(";")[0] || cookie;
        const result = await response.json();
        assert.equal(
          response.status,
          expected,
          path + ": " + (result.error || "")
        );
        if (result.csrf_token) csrf = result.csrf_token;
        return result;
      }
      const username = "golf_" + randomBytes(5).toString("hex");
      const password = "isolated-golf-test-password-123";
      const email = username + "@example.test";
      await request(bases[0], "session");
      await request(bases[0], "register", { username, password, email }, 201);
      let mail;
      for (let n = 0; n < 40 && !mail; n++) {
        mail = (await stack.mail()).find((item) => item.to === email);
        if (!mail) await delay(50);
      }
      assert(mail, "Verification is written only to the isolated local inbox");
      await request(bases[0], "verify-email", {
        token: new URL(mail.url).searchParams.get("token"),
      });
      await request(bases[1], "session");
      const login = await request(bases[1], "login", { username, password });
      for (const base of bases) {
        const session = await request(base, "session");
        assert.equal(session.user.id, login.user.id);
        assert.equal(session.user.name, username);
      }
      await request(bases[1], "profile", { profile_icon: "cat" });
      for (const base of bases)
        assert.equal((await request(base, "session")).user.profile_icon, "cat");
      // Protected private endpoints remain unreachable through Golf's public proxy.
      for (const path of [
        "/api/account/_internal/accounts/v1/session",
        "/api/account/%255finternal/accounts/v1/session",
      ]) {
        assert.equal(
          (await fetch(bases[1] + path, { method: "POST" })).status,
          404
        );
      }
      const destination = await fetch(
        bases[0].replace("127.0.0.1", "localhost") + "/golf/rules?from=cards",
        { redirect: "manual" }
      );
      assert.equal(
        destination.headers.get("location"),
        `http://localhost:${webPorts.golf}/rules?from=cards`
      );
      await request(bases[2], "logout", {});
      for (const base of bases)
        assert.equal((await request(base, "session")).user, null);
    } catch (error) {
      console.error(stack?.logs().slice(-2500) || "Stack failed to start");
      throw error;
    } finally {
      await stack?.close();
    }
  }
);
