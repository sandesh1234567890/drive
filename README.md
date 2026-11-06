# Uber Unified — Flutter clone of the Uber experience

One codebase → Android, iOS, Web. Rider and Captain flows with live dispatch, OTP verification and real-time GPS relay.

## What it does

- Sign up / login (JWT, secure storage)
- Rider: pickup + destination search, upfront fare breakdown (Uber pricing model), OTP, live map tracking
- Captain: online/offline toggle, live incoming requests, Accept, OTP verification to start, share ride GPS live
- Real-time ride events: new-ride → ride-confirmed → ride-started → ride-ended (Socket.IO)
- Ride history for rider and captain

## Stack

| Layer | Tech |
|-------|------|
| Client | Flutter, go_router, flutter_map, dio, socket_io_client, flutter_secure_storage |
| Maps | OpenStreetMap tiles + Nominatim (search) + OSRM (routing) |
| Server | Node.js + Express + MongoDB Atlas |
| Live | Socket.IO (captain GPS, status events) |
| Host | Render (API + static Web if built) |

## Layout

```
backend/          Express API + Socket.IO (this folder)
lib/              Flutter app source (used in separate workspace)
```

## API (this service, base `/`)

- POST /users/register · POST /users/login
- POST /captain/register · POST /captain/login
- POST /rides/create · POST /rides/confirm · GET /rides/start-ride · POST /rides/end-ride
- GET  /rides/history · GET /rides/captain-history
- GET  /maps/get-coordinates · GET /maps/get-distance · GET /maps/get-suggestions

## Try it

Release tag: `v1.0.0` — download the attached APK, or build yourself:

```bash
cd app
flutter pub get
flutter run
```

## Honest footnotes

- Fare rates are estimates; Uber's actual city rates are not public.
- Free Render plan sleeps; first request may take ~30s.
- No payment flow, no push notifications, no account reset.
