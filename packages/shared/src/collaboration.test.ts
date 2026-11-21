import assert from "node:assert/strict";
import test from "node:test";
import * as collaboration from "./collaboration.ts";

const me = "10000000-0000-4000-8000-000000000001";
const person = "20000000-0000-4000-8000-000000000002";
const conversation = "30000000-0000-4000-8000-000000000003";

test("switching discovery scope clears incompatible filters but preserves query and city", () => {
  const input = {
    query: "editor",
    city: "Kochi",
    role: "editor",
    genre: "Drama",
  };
  assert.deepEqual(collaboration.scopeDiscoverySearch(input, "profile"), {
    query: "editor",
    city: "Kochi",
    kind: "profile",
    role: "editor",
    genre: undefined,
  });
  assert.deepEqual(collaboration.scopeDiscoverySearch(input, "film"), {
    query: "editor",
    city: "Kochi",
    kind: "film",
    role: undefined,
    genre: "Drama",
  });
  assert.deepEqual(collaboration.scopeDiscoverySearch(input, "all"), {
    query: "editor",
    city: "Kochi",
    kind: "all",
    role: undefined,
    genre: undefined,
  });
});

test("guest contact requests sign-in without opening a conversation", async () => {
  const result = await collaboration.openCollaboratorConversation(
    {
      viewer: { id: async () => null },
      chat: {
        open: () => {
          throw new Error("Guests must not open conversations");
        },
      },
    },
    person,
  );
  assert.deepEqual(result, { status: "sign-in" });
});

test("contact opens the selected person's existing conversation", async () => {
  const result = await collaboration.openCollaboratorConversation(
    {
      viewer: { id: async () => me },
      chat: {
        open: async (id) => {
          assert.equal(id, person);
          return { data: conversation, error: null };
        },
      },
    },
    person,
  );
  assert.deepEqual(result, { status: "opened", conversationId: conversation });
});

test("self contact never invokes the conversation RPC", async () => {
  await assert.rejects(
    collaboration.openCollaboratorConversation(
      {
        viewer: { id: async () => me },
        chat: {
          open: () => {
            throw new Error("Unexpected RPC");
          },
        },
      },
      me,
    ),
    /another creative/,
  );
});

test("denied, empty and malformed contact replies cannot navigate to a conversation", async () => {
  for (const reply of [
    { data: null, error: { code: "42501" } },
    { data: null, error: null },
    { data: "not-a-conversation", error: null },
  ]) {
    await assert.rejects(
      collaboration.openCollaboratorConversation(
        {
          viewer: { id: async () => me },
          chat: { open: async () => reply },
        },
        person,
      ),
      /Couldn’t open/,
    );
  }
});

test("a failed contact can be retried without reporting success early", async () => {
  let attempts = 0;
  const api = {
    viewer: { id: async () => me },
    chat: {
      open: async () => {
        if (++attempts === 1) throw new Error("Offline");
        return { data: conversation, error: null };
      },
    },
  };
  await assert.rejects(collaboration.openCollaboratorConversation(api, person));
  assert.deepEqual(
    await collaboration.openCollaboratorConversation(api, person),
    {
      status: "opened",
      conversationId: conversation,
    },
  );
});
