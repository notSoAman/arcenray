type UpdateClient = {
  isEnabled: boolean;
  checkForUpdateAsync: () => Promise<{
    isAvailable: boolean;
    isRollBackToEmbedded?: boolean;
  }>;
  fetchUpdateAsync: () => Promise<unknown>;
};
/** Download silently. The native update client selects it on the next cold launch. */
export async function downloadAppUpdate(
  client: UpdateClient,
): Promise<boolean> {
  if (!client.isEnabled) return false;
  try {
    const check = await client.checkForUpdateAsync();
    if (!check.isAvailable && !check.isRollBackToEmbedded) return false;
    await client.fetchUpdateAsync();
    return true;
  } catch {
    return false;
  }
}

/** Apply only before app interaction begins; slow checks finish in the background. */
export async function prepareStartupUpdate(
  client: UpdateClient,
  budgetMs = 2500,
): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      downloadAppUpdate(client),
      new Promise<boolean>((resolve) => {
        timer = setTimeout(() => resolve(false), budgetMs);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
