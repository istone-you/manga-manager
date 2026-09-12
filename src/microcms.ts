import type { ListResponse, Magazine, Manga } from "./types";

const serviceDomain = import.meta.env.VITE_MICROCMS_SERVICE_DOMAIN as string | undefined;
const apiKey = import.meta.env.VITE_MICROCMS_API_KEY as string | undefined;
const showDrafts = import.meta.env.VITE_MICROCMS_INCLUDE_DRAFTS === "true";

const hasMicroCmsConfig = Boolean(serviceDomain && apiKey);

async function getList<T>(endpoint: string, params: Record<string, string | number> = {}) {
  if (!serviceDomain || !apiKey) {
    throw new Error("microCMS の環境変数が未設定です。");
  }

  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    searchParams.set(key, String(value));
  });

  const response = await fetch(
    `https://${serviceDomain}.microcms.io/api/v1/${endpoint}?${searchParams.toString()}`,
    {
      headers: {
        "X-MICROCMS-API-KEY": apiKey
      }
    }
  );

  if (!response.ok) {
    throw new Error(`${endpoint} の取得に失敗しました。HTTP ${response.status}`);
  }

  return (await response.json()) as ListResponse<T>;
}

async function getAll<T>(endpoint: string, params: Record<string, string | number> = {}) {
  const limit = 100;
  const first = await getList<T>(endpoint, { ...params, limit, offset: 0 });
  const contents = [...first.contents];

  for (let offset = limit; offset < first.totalCount; offset += limit) {
    const next = await getList<T>(endpoint, { ...params, limit, offset });
    contents.push(...next.contents);
  }

  return contents;
}

export async function getLibraryData() {
  if (!hasMicroCmsConfig) {
    throw new Error(
      "microCMS の環境変数が未設定です。VITE_MICROCMS_SERVICE_DOMAIN と VITE_MICROCMS_API_KEY を設定してください。"
    );
  }

  const [manga, magazines] = await Promise.all([
    getAll<Manga>("manga", { depth: 2, orders: "title" }),
    getAll<Magazine>("magazines", { depth: 2, orders: "name" })
  ]);

  return {
    manga,
    magazines,
    showDrafts
  };
}
