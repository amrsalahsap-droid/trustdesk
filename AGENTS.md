<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

<!-- END:nextjs-agent-rules -->

## Answer review cadence (freshness)

Schedule `POST /api/internal/answer-freshness/run` with header `Authorization: Bearer <CRON_SECRET>` (same secret as other internal cron routes). This marks overdue approved answers as `EXPIRED`, sets `expiresAt`, and downgrades export flags. Wire Vercel Cron or an external scheduler to call it daily (or as needed).
