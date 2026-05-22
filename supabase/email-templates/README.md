# Email templates de Supabase Auth — Vinanzas

Templates HTML para los correos transaccionales que envía Supabase Auth,
con el branding de Vinanzas (fondo oscuro, logo, paleta teal/amber).

## Archivos

| Archivo | Email | Subject |
|---|---|---|
| `confirmation.html` | Confirmación de cuenta (al registrarse) | `Confirmá tu cuenta en Vinanzas` |
| `recovery.html` | Recuperación de contraseña (al pedir reset) | `Recuperá tu contraseña de Vinanzas` |

El script de deploy vive un nivel arriba: `supabase/deploy-emails.sh`.

## Branding aplicado

- Fondo: `#1a1917`
- Tarjeta / superficie: `#242320`
- Color primario (logo, botón, links): `#5DCAA5`
- Texto principal: `#f0efe9` · texto secundario: `#a8a79f`
- Botón CTA: fondo `#5DCAA5`, texto `#0a2218`
- Logo: `https://lucianoperez.github.io/mis-finanzas/logo.svg`
- Ancho máximo: 560px, centrado

## Variables de template

Los templates usan la sintaxis de Go templates de Supabase:

- `{{ .ConfirmationURL }}` — URL del link de confirmación / reset. Se usa en
  el botón CTA y en el enlace de respaldo en texto plano.

## Decisiones de compatibilidad con email clients

- Layout 100% basado en tablas (`<table role="presentation">`), todo el CSS
  inline. Sin flexbox ni grid.
- El fondo oscuro se aplica tanto en `<body>` como en una tabla wrapper a
  100% de ancho, porque varios clients (Gmail) ignoran el fondo del body.
- El logo es un `<img>` con `alt="Vinanzas"`: si el client bloquea la imagen
  (algunos no renderizan SVG), el texto alternativo sigue siendo legible.
- Se incluye un enlace de respaldo en texto plano por si el botón no funciona.
- Hay un preheader oculto que mejora el preview en la bandeja de entrada.

## Cómo editar

Editá directamente `confirmation.html` o `recovery.html`. Mantené el CSS
inline y la estructura de tablas. Después de editar, volvé a desplegar.

## Cómo desplegar

El deploy se hace contra la Supabase Management API (project ref
`qvoyhnapwqqnwakauevd`) usando un Personal Access Token (PAT).

Desde la raíz del repo:

```bash
SUPABASE_ACCESS_TOKEN=tu_pat_aca bash supabase/deploy-emails.sh
```

El script empaqueta ambos templates más sus subjects en un único payload
JSON (construido con `python3` para escapar las tildes de forma segura) y lo
envía con `PATCH` al endpoint `/config/auth`. No requiere el Supabase CLI.

> El PAT no se guarda en el repo. Generá uno en
> https://supabase.com/dashboard/account/tokens y pasalo solo como variable
> de entorno al momento de ejecutar el script.
