# GatorPlan web

Next.js front end. It reads everything from the Go API in `../server`.

```sh
npm install
npm run dev        # http://localhost:3000
```

Requests to `/api/*` are proxied to `API_URL` (default `http://localhost:8080`),
so start the API first (see `../server/README.md`). Plans live in page state
only: every visit starts with an empty schedule.
