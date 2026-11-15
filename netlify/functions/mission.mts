import { getStore } from "@netlify/blobs";
import { createApi } from "../../server/api.ts";
import { providers } from "../../server/providers.ts";
import type { Store } from "../../server/store.ts";

/** Append-only event keys avoid lost updates between concurrent serverless instances. */
export default async function handler(request: Request) {
  const blobs = getStore({
    name: "neuroorbit-sessions-v1",
    consistency: "strong",
  });

  const store: Store = {
    get: <T,>(key: string) =>
      blobs.get(key, {
        type: "json",
        consistency: "strong",
      }) as Promise<T | null>,

    put: async (key, value) => {
      await blobs.setJSON(key, value);
    },

    list: async <T,>(prefix: string): Promise<T[]> => {
      const records: T[] = [];

      for await (const page of blobs.list({
        prefix,
        paginate: true,
      })) {
        if (records.length + page.blobs.length > 5000) {
          throw new Error("Session event limit exceeded");
        }

        // Bound parallel reads; concurrent requests only add immutable entries.
        for (let i = 0; i < page.blobs.length; i += 20) {
          const batch = await Promise.all(
            page.blobs.slice(i, i + 20).map(
              (b) =>
                blobs.get(b.key, {
                  type: "json",
                  consistency: "strong",
                }) as Promise<T | null>,
            ),
          );

          records.push(...batch.filter((v): v is Awaited<T> => v !== null));
        }
      }

      return records;
    },
  };

  const allowed = (process.env.API_ALLOWED_ORIGINS || "")
    .split(",")
    .map((s: string) => s.trim())
    .filter(Boolean);

  return createApi({ store, ...providers(process.env) }, allowed)(request);
}

export const config = { path: "/api/*" };