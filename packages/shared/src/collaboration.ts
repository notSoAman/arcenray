import { uuidSchema } from "./contracts.ts";

/** Scope changes preserve the query/city, never an incompatible exact filter. */
export function scopeDiscoverySearch<
  T extends { role?: string; genre?: string },
>(input: T, kind: "all" | "film" | "profile") {
  return {
    ...input,
    kind,
    role: kind === "profile" ? input.role : undefined,
    genre: kind === "film" ? input.genre : undefined,
  };
}

type ContactApi = {
  viewer: { id(): Promise<string | null> };
  chat: {
    open(
      personId: string,
    ): PromiseLike<{ data: string | null; error: unknown }>;
  };
};

/** Opens the existing authorized RPC only; never sends an introduction for the user. */
export async function openCollaboratorConversation(
  api: ContactApi,
  personId: string,
): Promise<
  { status: "sign-in" } | { status: "opened"; conversationId: string }
> {
  const viewer = await api.viewer.id();
  if (!viewer) return { status: "sign-in" };
  if (viewer === personId)
    throw new Error("Choose another creative to message.");
  const { data, error } = await api.chat.open(personId);
  if (error || !uuidSchema.safeParse(data).success)
    throw new Error(
      "Couldn’t open the conversation. Check your connection and try again.",
    );
  return { status: "opened", conversationId: data! };
}
