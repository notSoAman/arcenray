import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types.ts";
import {
  eventSchema,
  filmDraftSchema,
  messageSchema,
  profileInputSchema,
  searchSchema,
  uploadSchema,
  uuidSchema,
} from "./contracts.ts";
import type {
  FilmDraft,
  ProfileInput,
  SearchInput,
  UploadInput,
} from "./contracts.ts";

/** Inject the platform's authenticated client; RLS remains the authority. */
export function createArcenrayClient(supabase: SupabaseClient<Database>) {
  async function userId() {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw new Error("Sign in to continue");
    return data.user.id;
  }
  return {
    supabase,
    profiles: {
      get: (id: string) =>
        supabase
          .from("profiles")
          .select("*")
          .eq("id", uuidSchema.parse(id))
          .single(),
      async update(input: ProfileInput) {
        return supabase
          .from("profiles")
          .update(profileInputSchema.parse(input))
          .eq("id", await userId())
          .select()
          .single();
      },
    },
    films: {
      get: (id: string) =>
        supabase
          .from("films")
          .select("*")
          .eq("id", uuidSchema.parse(id))
          .single(),
      async createDraft(input: FilmDraft) {
        return supabase
          .from("films")
          .insert({ ...filmDraftSchema.parse(input), owner_id: await userId() })
          .select()
          .single();
      },
      updateDraft: (id: string, input: FilmDraft) =>
        supabase
          .from("films")
          .update(filmDraftSchema.parse(input))
          .eq("id", uuidSchema.parse(id))
          .eq("status", "draft")
          .select()
          .single(),
      publish: (id: string) =>
        supabase.functions.invoke("media-upload", {
          body: { action: "publish", film_id: uuidSchema.parse(id) },
        }),
      feed: (limit = 20, offset = 0, genre?: string) =>
        supabase.rpc("get_personalized_feed", {
          p_limit: Math.min(50, Math.max(1, limit)),
          p_offset: Math.max(0, offset),
          p_genre: genre,
        }),
    },
    search: (input: SearchInput) =>
      supabase.functions.invoke("search", { body: searchSchema.parse(input) }),
    chat: {
      open: (otherUser: string) =>
        supabase.rpc("open_conversation", {
          p_other_user: uuidSchema.parse(otherUser),
        }),
      messages: (conversation: string) =>
        supabase
          .from("messages")
          .select("*")
          .eq("conversation_id", uuidSchema.parse(conversation))
          .order("created_at", { ascending: false })
          .limit(50),
      async send(input: Parameters<typeof messageSchema.parse>[0]) {
        return supabase
          .from("messages")
          .insert({ ...messageSchema.parse(input), sender_id: await userId() })
          .select()
          .single();
      },
    },
    credits: {
      respond: (id: string, accept: boolean) =>
        supabase.rpc("respond_to_credit", {
          p_credit_id: uuidSchema.parse(id),
          p_accept: accept,
        }),
    },
    events: {
      record(input: Parameters<typeof eventSchema.parse>[0]) {
        const event = eventSchema.parse(input);
        return supabase.rpc("record_event", {
          p_film_id: event.film_id,
          p_kind: event.kind,
          p_idempotency_key: event.idempotency_key,
          p_watch_seconds: event.watch_seconds,
        });
      },
    },
    media: {
      storage: () => supabase.rpc("get_my_storage"),
      create: (input: UploadInput) =>
        supabase.functions.invoke("media-upload", {
          body: { action: "create", ...uploadSchema.parse(input) },
        }),
      complete: (assetId: string) =>
        supabase.functions.invoke("media-upload", {
          body: { action: "complete", asset_id: uuidSchema.parse(assetId) },
        }),
    },
    index: (kind: "film" | "profile", id: string) =>
      supabase.functions.invoke("index-entity", {
        body: { kind, id: uuidSchema.parse(id) },
      }),
  };
}
