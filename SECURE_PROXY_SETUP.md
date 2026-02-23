# Secure API Proxy Setup

This project was updated so front-end pages no longer contain hard-coded API keys.

## Required backend endpoints

- `GET /api/maps/js?callback=initMap&libraries=geometry`
  - Server should fetch Google Maps JS API using a server-side key (or signed URL) and return it.
- `GET /api/ragic/{formPath}` and `GET /api/ragic/{formPath}/{recordId}`
  - Proxy to `https://ap15.ragic.com/wuohome/{formPath}` with query `api=true&v=3&naming=EID&APIKey=<server-secret>`.
- `POST /api/ragic/{formPath}` and `POST /api/ragic/{formPath}/{recordId}`
  - Forward form body to Ragic with same server-side API key.

## Security recommendations

1. Rotate any leaked keys immediately (Google + Ragic).
2. Restrict Google key by HTTP referrer and API scope.
3. Restrict Ragic key scope/permissions to minimum required forms.
4. Add rate limit on `/api/ragic/*` to avoid abuse and billing spikes.
5. Monitor 4xx/5xx and quota usage alerts.
