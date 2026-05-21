// admin-users — Supabase Edge Function
// Lists all registered users, reports per-user data usage, and handles
// admin operations: soft ban/unban, force password reset, resend email
// confirmation, and deletion of a user's financial data.
// Security: validates that the caller is ADMIN_EMAIL before any operation.
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

  // ── 3. GET — list users + per-user data usage ─────────────────────────
  if (req.method === "GET") {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?page=1&per_page=200`, {
      headers: adminHeaders,
    })
    const data = await res.json()
    if (!res.ok) return json(data, res.status)

    // Fetch all finanzas_state rows once and compute byte size per user.
    // Only the size is exposed — the raw state is never returned to the client.
    const sizes: Record<string, number> = {}
    try {
      const stateRes = await fetch(
        `${SUPABASE_URL}/rest/v1/finanzas_state?select=user_id,state`,
        { headers: adminHeaders },
      )
      if (stateRes.ok) {
        const rows = await stateRes.json()
        for (const row of rows) {
          if (!row || !row.user_id) continue
          const bytes = row.state == null
            ? 0
            : new TextEncoder().encode(JSON.stringify(row.state)).length
          sizes[row.user_id] = bytes
        }
      }
    } catch (_e) {
      // If the usage query fails, fall back to no sizes — users still load.
    }

    const users = Array.isArray(data.users) ? data.users : []
    for (const u of users) {
      u.data_bytes = sizes[u.id] ?? 0
    }
    return json(data, res.status)
  }

  // ── 4. POST — admin actions ───────────────────────────────────────────
  if (req.method === "POST") {
    const body = await req.json().catch(() => ({}))
    const { userId, action } = body
    const VALID = ["ban", "unban", "reset-password", "resend-confirmation", "delete-data"]

    if (!userId || !VALID.includes(action)) {
      return json({
        error: `Required: userId (string) and action (one of: ${VALID.join(", ")})`,
      }, 400)
    }

    // ── 4a. ban / unban ─────────────────────────────────────────────────
    if (action === "ban" || action === "unban") {
      // ban_duration "876000h" ≈ 100 years;  "none" removes the ban
      const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
        method:  "PUT",
        headers: adminHeaders,
        body:    JSON.stringify({ ban_duration: action === "ban" ? "876000h" : "none" }),
      })
      return json(await res.json(), res.status)
    }

    // ── 4b. delete-data — remove the user's finanzas_state row ──────────
    if (action === "delete-data") {
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/finanzas_state?user_id=eq.${encodeURIComponent(userId)}`,
        {
          method:  "DELETE",
          headers: { ...adminHeaders, Prefer: "return=representation" },
        },
      )
      if (!res.ok) {
        const err = await res.text()
        return json({ error: "No se pudieron borrar los datos.", detail: err }, res.status)
      }
      const deleted = await res.json().catch(() => [])
      return json({ ok: true, deleted: Array.isArray(deleted) ? deleted.length : 0 })
    }

    // ── 4c. reset-password / resend-confirmation ────────────────────────
    // Both need the user's email address — look it up via the Admin API.
    const lookupRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
      headers: adminHeaders,
    })
    if (!lookupRes.ok) {
      return json({ error: "Usuario no encontrado." }, 404)
    }
    const targetUser = await lookupRes.json()
    const email = targetUser.email
    if (!email) {
      return json({ error: "El usuario no tiene email asociado." }, 400)
    }

    if (action === "reset-password") {
      // Send the standard password recovery email.
      const res = await fetch(`${SUPABASE_URL}/auth/v1/recover`, {
        method:  "POST",
        headers: { apikey: SERVICE_ROLE_KEY, "Content-Type": "application/json" },
        body:    JSON.stringify({ email }),
      })
      if (!res.ok) {
        const err = await res.text()
        return json({ error: "No se pudo enviar el email de reseteo.", detail: err }, res.status)
      }
      return json({ ok: true, action, email })
    }

    if (action === "resend-confirmation") {
      if (targetUser.email_confirmed_at) {
        return json({ error: "El email ya está confirmado." }, 400)
      }
      // Resend the signup confirmation email.
      const res = await fetch(`${SUPABASE_URL}/auth/v1/resend`, {
        method:  "POST",
        headers: { apikey: SERVICE_ROLE_KEY, "Content-Type": "application/json" },
        body:    JSON.stringify({ type: "signup", email }),
      })
      if (!res.ok) {
        const err = await res.text()
        return json({ error: "No se pudo reenviar la confirmación.", detail: err }, res.status)
      }
      return json({ ok: true, action, email })
    }

    return json({ error: "Acción no soportada." }, 400)
  }

  return json({ error: "Method not allowed" }, 405)
})
