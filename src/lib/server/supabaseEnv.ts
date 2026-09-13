import "server-only";

/** Read only when a server operation needs the DB, never during module import. */
export function getSupabaseEnv() {
  const url = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url) throw new Error("Missing server environment variable: SUPABASE_URL");
  if (!key) throw new Error("Missing server environment variable: SUPABASE_SERVICE_ROLE_KEY");

  // Do not propagate URL parser errors: they can contain the original input.
  let validUrl = false;
  try {
    const parsed = new URL(url);
    const localHttp = parsed.protocol === "http:" &&
      ["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname);
    validUrl = (parsed.protocol === "https:" || localHttp) &&
      !parsed.username && !parsed.password && !parsed.search && !parsed.hash &&
      parsed.pathname === "/";
  } catch { /* Report only the variable name below. */ }
  if (!validUrl) throw new Error("Invalid server environment variable: SUPABASE_URL");
  return { url, key };
}
