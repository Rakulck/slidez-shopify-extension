// app/utils/firebase-client.ts
// Runs ONLY in Remix loaders/actions — never in the browser.
// The Firebase API key is read from environment variables server-side.

const FIREBASE_API_BASE_URL = process.env.FIREBASE_API_BASE_URL ?? "";
const FIREBASE_API_KEY = process.env.FIREBASE_API_KEY ?? "";

export async function firebaseGet(path: string, shop: string) {
  if (!FIREBASE_API_BASE_URL) {
    console.error("CRITICAL: FIREBASE_API_BASE_URL is not defined in your .env file!");
    throw new Error("Missing Firebase API URL configuration");
  }
  
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  const url = `${FIREBASE_API_BASE_URL}${cleanPath}${cleanPath.includes("?") ? "&" : "?"}shop=${encodeURIComponent(shop)}`;
  
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${FIREBASE_API_KEY}`,
    },
  });
  return res.json();
}

export async function firebasePost(path: string, body: object) {
  if (!FIREBASE_API_BASE_URL) {
    throw new Error("Missing Firebase API URL configuration");
  }
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  const res = await fetch(`${FIREBASE_API_BASE_URL}${cleanPath}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${FIREBASE_API_KEY}`,
    },
    body: JSON.stringify(body),
  });
  return res.json();
}
