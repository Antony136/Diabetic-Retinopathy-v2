import api from "./api";

const IMAGE_CACHE_KEY = "retina_image_cache";

interface ImageCacheMap {
  [remoteUrl: string]: string;
}

function getCacheMap(): ImageCacheMap {
  try {
    const raw = localStorage.getItem(IMAGE_CACHE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as ImageCacheMap;
  } catch {
    return {};
  }
}

function setCacheMap(map: ImageCacheMap) {
  try {
    localStorage.setItem(IMAGE_CACHE_KEY, JSON.stringify(map));
  } catch {
    // ignore
  }
}

export function getCachedImageUrl(remoteUrl: string): string | null {
  if (!remoteUrl) return null;
  const map = getCacheMap();
  return map[remoteUrl] || null;
}

export async function getCachedImageUrlFromServer(remoteUrl: string): Promise<string | null> {
  if (!remoteUrl) return null;

  try {
    const response = await api.get("/images/cache", { params: { url: remoteUrl } });
    if (response.status !== 200) return null;

    const data = response.data as { local_url?: string | null };
    if (data?.local_url) {
      setCachedImageUrl(remoteUrl, data.local_url);
      return data.local_url;
    }
    return null;
  } catch {
    return null;
  }
}

export function setCachedImageUrl(remoteUrl: string, localUrl: string) {
  if (!remoteUrl || !localUrl) return;
  const map = getCacheMap();
  map[remoteUrl] = localUrl;
  setCacheMap(map);
}

export async function cacheRemoteImage(remoteUrl: string): Promise<string | null> {
  if (!remoteUrl || !remoteUrl.startsWith("http")) return null;

  const cached = getCachedImageUrl(remoteUrl);
  if (cached) return cached;

  const cachedFromServer = await getCachedImageUrlFromServer(remoteUrl);
  if (cachedFromServer) return cachedFromServer;

  try {
    const formData = new FormData();
    formData.append("url", remoteUrl);

    const response = await api.post("/images/cache", formData);
    if (response.status !== 200) {
      return null;
    }

    const data = response.data as { local_url?: string };
    if (data?.local_url) {
      setCachedImageUrl(remoteUrl, data.local_url);
      return data.local_url;
    }

    return null;
  } catch {
    return null;
  }
}
