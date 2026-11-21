/** Keep OAuth returns out of the unmatched-route page while Clerk finalizes. */
export function redirectSystemPath({path}:{path:string;initial:boolean}) {
  try {
    const url=new URL(path);
    if(url.protocol==='clerk:' && ['com.arcenray.mobile.hosted-callback','com.arcenray.mobile.dev.hosted-callback'].includes(url.hostname)) return '/sign-in';
  } catch { /* Expo Router also sends relative internal paths. */ }
  return path;
}
