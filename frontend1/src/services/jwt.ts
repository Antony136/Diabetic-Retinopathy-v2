export type JwtPayload = Record<string, unknown>;

function base64UrlDecode(input: string) {
  const pad = "=".repeat((4 - (input.length % 4)) % 4);
  const base64 = (input + pad).replaceAll("-", "+").replaceAll("_", "/");
  const decoded = atob(base64);
  // decodeURIComponent trick to handle UTF-8
  try {
    return decodeURIComponent(
      decoded
        .split("")
        .map((c) => `%${c.charCodeAt(0).toString(16).padStart(2, "0")}`)
        .join(""),
    );
  } catch {
    return decoded;
  }
}

export function decodeJwtPayload(token: string): JwtPayload | null {
  try {
    const parts = token.split(".");
    if (parts.length < 2) return null;
    const raw = base64UrlDecode(parts[1]!);
    return JSON.parse(raw) as JwtPayload;
  } catch {
    return null;
  }
}

export function getRoleFromToken(token: string | null): string | null {
  if (!token) return null;
  const payload = decodeJwtPayload(token);
  const role = payload?.role;
  return typeof role === "string" ? role : null;
}

export function getUserIdFromToken(token: string | null): number | null {
  if (!token) return null;
  const payload = decodeJwtPayload(token);
  const sub = payload?.sub;
  if (typeof sub === "string" || typeof sub === "number") {
    const id = Number(sub);
    return Number.isFinite(id) && id > 0 ? id : null;
  }
  return null;
}

