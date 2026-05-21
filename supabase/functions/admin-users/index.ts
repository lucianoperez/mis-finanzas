// admin-users — Supabase Edge Function
// Lists all registered users and handles soft ban/unban.
// Security: validates that the caller is ADMIN_EMAIL before any admin operation.
// The SERVICE_ROLE_KEY never leaves this function (injected automatically by Supabase).

const SUPABASE_URL     = Deno.env.get("SUPABASE_URL")!
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
const ANON_KEY         = Deno.env.get("SUPABASE_ANON_KEY")!
const ADMIN_EMAIL      = Deno.env.get("ADMIN_EMAIL") ?? "luciano.v.perez@hotmail.com"

const cors = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  })
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors })

  // ── 1. Require Authorization header ──────────────────────────────────
  const auth = req.headers.get("Authorization")
  if (!auth) return json({ error: "Unauthorized" }, 401)

  // ── 2. Verify caller's JWT and check admin email ──────────────────────
  const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: ANON_KEY, Authorization: auth },
  })
  if (!userRes.ok) return json({ error: "Invalid token" }, 401)
  const caller = await userRes.json()
  if (caller.email !== ADMIN_EMAIL) return json({ error: "Forbidden" }, 403)

  const adminHeaders = {
    apikey:          SERVICE_ROLE_KEY,
    Authorization:   `Bearer ${SERVICE_ROLE_KEY}`,
    "Content-Type":  "application/json",
  }

  // ── 3. GET — list users ───────────────────────────────────────────────
  if (req.method === "GET") {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?page=1&per_page=200`, {
      headers: adminHeaders,
    })
    return json(await res.json(), res.status)
  }

  // ── 4. POST — ban or unban ────────────────────────────────────────────
  if (req.method === "POST") {
    const body = await req.json().catch(() => ({}))
    const { userId, action } = body

    if (!userId || !["ban", "unban"].includes(action)) {
      return json({ error: "Required: userId (string) and action ('ban' | 'unban')" }, 400)
    }

    // ban_duration "876000h" ≈ 100 years;  "none" removes the ban
    const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
      method:  "PUT",
      headers: adminHeaders,
      body:    JSON.stringify({ ban_duration: action === "ban" ? "876000h" : "none" }),
    })
    return json(await res.json(), res.status)
  }

  return json({ error: "Method not allowed" }, 405)
})
