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
  async function viewerId(): Promise<string | null> {
    const { data, error } = await supabase.rpc("current_profile_id");
    if (error) throw error;
    return data;
  }
  async function userId() {
    const id = await viewerId();
    if (!id) throw new Error("Sign in to continue");
    return id;
  }
  return {
    supabase,
    viewer: { id: viewerId },
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
    async search(input: SearchInput): Promise<{
      data: {
        results: {
          id: string;
          kind: string;
          title: string;
          summary: string;
          score: number;
        }[];
        mode: "hybrid" | "full_text";
      } | null;
      error: unknown;
    }> {
      const parsed = searchSchema.parse(input);
      if (await viewerId())
        return supabase.functions.invoke("search", { body: parsed });
      const { data, error } = await supabase.rpc("hybrid_search", {
        p_query: parsed.query,
        p_kind: parsed.kind,
        p_city: parsed.city,
        p_role: parsed.role,
        p_genre: parsed.genre,
        p_limit: parsed.limit,
      });
      return {
        data: data ? { results: data, mode: "full_text" } : null,
        error,
      };
    },
    loop: {
      page: (excludeIds: string[] = [], limit = 10) => {
        const ids = uuidSchema.array().max(10000).parse(excludeIds);
        return supabase.rpc("get_loop_feed", {
          p_limit: Math.min(50, Math.max(1, limit)),
          p_exclude_ids: ids,
        });
      },
      feedback: (filmId: string, preference: "more" | "less") => {
        if (preference !== "more" && preference !== "less")
          throw new Error("Invalid preference");
        return supabase.rpc("set_film_feedback", {
          p_film_id: uuidSchema.parse(filmId),
          p_preference: preference,
        });
      },
      preferences: () => supabase.rpc("get_my_film_feedback"),
    },
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
