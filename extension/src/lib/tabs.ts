/** Open only on an explicit click; no account session or website host access. */
export async function openSiteTab(url: string): Promise<void> {
  await chrome.tabs.create({ url });
}
