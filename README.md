# AIC2026 Retrieval Frontend Starter

Frontend prototype copied from the old AIC_LITE style and adjusted to run without backend.

## Run

```bash
npm install
npm run dev
```

Then open the Vite URL, usually http://localhost:5173.

## What is included

- React + TypeScript + Vite
- Tailwind CSS v4
- Zustand store
- Mock API in `src/api.ts`
- Mock multimedia results in `src/data/mockResults.ts`
- Search panel, result grid, result card, preview modal, answer builder

## Later backend integration

Replace the mock implementation in `src/api.ts` with real `fetch('/api/search/')` calls.
