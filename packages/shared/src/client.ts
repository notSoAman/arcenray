import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types.ts";
import {
  multipartCreateSchema,
  multipartSignSchema,
  eventSchema,
  filmDraftSchema,
  messageSchema,
  profileInputSchema,
  searchSchema,
  uploadSchema,
  uuidSchema,
} from "./contracts.ts";
import type {
  MultipartCreateInput,
  MultipartSignInput,
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
          .in("status", ["draft", "published"])
          .select()
          .single(),
      publish: (id: string) =>
        supabase.functions.invoke("media-upload", {
          body: { action: "publish", film_id: uuidSchema.parse(id) },
        }),
      publishWhenReady: (id: string, enabled: boolean) =>
        supabase.rpc("set_film_publication", {
          p_film: uuidSchema.parse(id),
          p_enabled: enabled,
        }),
      publication: (id: string) =>
        supabase.rpc("get_film_publication", { p_film: uuidSchema.parse(id) }),
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
      if (parsed.query && (await viewerId()))
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
      attachment: {
        create: (input: {
          conversation_id: string;
          name: string;
          content_type: string;
          bytes: number;
        }) =>
          supabase.functions.invoke<{
            asset_id: string;
            upload_url: string;
            headers: Record<string, string>;
          }>("chat-media", { body: { action: "create", ...input } }),
        complete: (assetId: string) =>
          supabase.functions.invoke<{ asset_id: string }>("chat-media", {
            body: { action: "complete", asset_id: uuidSchema.parse(assetId) },
          }),
        download: (assetId: string) =>
          supabase.functions.invoke<{
            url: string;
            name: string;
            content_type: string;
            bytes: number;
          }>("chat-media", {
            body: { action: "download", asset_id: uuidSchema.parse(assetId) },
          }),
      },
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
        const parsed = messageSchema.parse(input);
        const sender = await userId();
        const reply = await supabase
          .from("messages")
          .insert({ ...parsed, sender_id: sender })
          .select()
          .single();
        // A lost acknowledgement is safe to retry with the same client ID.
        if (reply.error?.code === "23505" && parsed.client_id) {
          const existing = await supabase
            .from("messages")
            .select("*")
            .eq("sender_id", sender)
            .eq("client_id", parsed.client_id)
            .eq("conversation_id", parsed.conversation_id)
            .single();
          if (existing.data) return existing;
        }
        return reply;
      },
    },
    credits: {
      search: (query: string) =>
        supabase.rpc("search_credit_collaborators", {
          p_query: query.trim().slice(0, 80),
          p_limit: 8,
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
      multipart: {
        create: (input: MultipartCreateInput) =>
          supabase.functions.invoke<unknown>("media-upload", {
            body: {
              action: "multipart_create",
              ...multipartCreateSchema.parse(input),
            },
          }),
        list: (draftId: string) =>
          supabase.functions.invoke<unknown>("media-upload", {
            body: {
              action: "multipart_list",
              draft_id: uuidSchema.parse(draftId),
            },
          }),
        status: (assetId: string) =>
          supabase.functions.invoke<unknown>("media-upload", {
            body: {
              action: "multipart_status",
              asset_id: uuidSchema.parse(assetId),
            },
          }),
        sign: (input: MultipartSignInput) =>
          supabase.functions.invoke<unknown>("media-upload", {
            body: {
              action: "multipart_sign",
              ...multipartSignSchema.parse(input),
            },
          }),
        finish: (assetId: string) =>
          supabase.functions.invoke<unknown>("media-upload", {
            body: {
              action: "multipart_finish",
              asset_id: uuidSchema.parse(assetId),
            },
          }),
        abort: (assetId: string) =>
          supabase.functions.invoke<unknown>("media-upload", {
            body: {
              action: "multipart_abort",
              asset_id: uuidSchema.parse(assetId),
            },
          }),
      },
      storage: () => supabase.rpc("get_my_storage"),
      processing: {
        status: (assetId: string) =>
          supabase.rpc("get_media_processing_state", {
            p_asset: uuidSchema.parse(assetId),
          }),
        retry: (assetId: string) =>
          supabase.rpc("retry_media_processing", {
            p_asset: uuidSchema.parse(assetId),
          }),
      },
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
