# Privacy Policy (Self-Hosted)

_Last updated: 9/6/2025_

This service (“Server”) accepts a DJI TXT flight log upload and streams back JSON produced by DJI’s FlightRecordParsingLib. It is intended to be self-hosted by you.

## What we process
- **Uploaded file**: the TXT you submit to `/parse`.
- **Derived output**: JSON produced by the parser is streamed back to you.
- **Technical logs**: minimal server logs (timestamps, HTTP status, IP for rate limiting).

## Storage & retention
- **No persistence by default**: uploads go to `/tmp` and are deleted after the parsing process completes or aborts.
- **Logs**: process logs may be stored by your hosting platform’s defaults. Configure or disable as you prefer.

## Third parties
- The parser may contact DJI services to obtain decryption material as part of the official parsing flow; no user identity is sent beyond what DJI’s library requires.

## Your choices
- Do not upload if you do not want the file processed.
- For hosted deployments, contact the operator at the email shown below to request deletion of any stored logs.

## Data deletion request
Email: **support@fpv.fish** with the request and the approximate timestamp/IP so we can locate and delete any retained logs.

## Security
- Keys are provided at runtime via environment variables; do not hardcode keys.
- Place the service behind HTTPS and access controls if exposed publicly.

## Contact
**support@fpv.fish**
