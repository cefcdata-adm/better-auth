const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const HOSTNAME_REGEX = /^(?=.{1,253}$)(?!-)[a-z0-9.-]+(?<!-)$/i;

export type AccessRequestInput = {
  name: string;
  email: string;
  clientId: string | null;
};

export type OAuthAppInput = {
  name: string;
  subdomain: string;
  redirectUris: string[];
  postLogoutRedirectUris: string[];
  sessionTimeout: number;
};

export type OAuthMetadata = {
  subdomain: string;
  sessionTimeout: number;
  postLogoutRedirectUris: string[];
};

export function parseAccessRequestInput(body: unknown):
  | { ok: true; data: AccessRequestInput }
  | { ok: false; error: string } {
  const raw = typeof body === "object" && body !== null ? body as Record<string, unknown> : {};
  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  const email = typeof raw.email === "string" ? raw.email.trim().toLowerCase() : "";
  const clientId =
    raw.clientId == null ? null : typeof raw.clientId === "string" ? raw.clientId.trim() : "";

  if (!name || name.length > 120) {
    return { ok: false, error: "Name must be between 1 and 120 characters." };
  }

  if (!email || email.length > 254 || !EMAIL_REGEX.test(email)) {
    return { ok: false, error: "A valid email address is required." };
  }

  if (clientId === "") {
    return { ok: false, error: "clientId must be a non-empty string when provided." };
  }

  return {
    ok: true,
    data: { name, email, clientId },
  };
}

export function parseIdPair(body: unknown):
  | { ok: true; data: { userId: string; clientId: string } }
  | { ok: false; error: string } {
  const raw = typeof body === "object" && body !== null ? body as Record<string, unknown> : {};
  const userId = typeof raw.userId === "string" ? raw.userId.trim() : "";
  const clientId = typeof raw.clientId === "string" ? raw.clientId.trim() : "";

  if (!userId || userId.length > 255 || !clientId || clientId.length > 255) {
    return { ok: false, error: "userId and clientId are required." };
  }

  return { ok: true, data: { userId, clientId } };
}

export function parseOAuthMetadata(raw: string | null | undefined): OAuthMetadata {
  if (!raw) {
    return { subdomain: "", sessionTimeout: 28800, postLogoutRedirectUris: [] };
  }

  try {
    const parsed = JSON.parse(raw) as {
      subdomain?: unknown;
      sessionTimeout?: unknown;
      postLogoutRedirectUris?: unknown;
    };
    const subdomain = typeof parsed.subdomain === "string" ? parsed.subdomain.trim() : "";
    const sessionTimeout = normalizeSessionTimeout(parsed.sessionTimeout, 28800);
    const postLogoutRedirectUris = normalizeOptionalUriList(parsed.postLogoutRedirectUris);

    return { subdomain, sessionTimeout, postLogoutRedirectUris };
  } catch {
    return { subdomain: "", sessionTimeout: 28800, postLogoutRedirectUris: [] };
  }
}

export function parseOAuthAppInput(body: unknown):
  | { ok: true; data: OAuthAppInput }
  | { ok: false; error: string } {
  const raw = typeof body === "object" && body !== null ? body as Record<string, unknown> : {};
  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  const subdomain = typeof raw.subdomain === "string" ? raw.subdomain.trim() : "";
  const redirectUris = Array.isArray(raw.redirectUris) ? raw.redirectUris : [];
  const postLogoutRedirectUris = Array.isArray(raw.postLogoutRedirectUris) ? raw.postLogoutRedirectUris : [];
  const sessionTimeout = normalizeSessionTimeout(raw.sessionTimeout, NaN);

  if (!name || name.length > 120) {
    return { ok: false, error: "App name must be between 1 and 120 characters." };
  }

  if (subdomain && (!HOSTNAME_REGEX.test(subdomain) || subdomain.includes(".."))) {
    return { ok: false, error: "Subdomain must be a valid hostname." };
  }

  if (!Number.isInteger(sessionTimeout) || sessionTimeout < 300 || sessionTimeout > 86_400) {
    return { ok: false, error: "Session timeout must be an integer between 300 and 86400 seconds." };
  }

  const normalizedRedirectUris = normalizeUriList(redirectUris, {
    fieldLabel: "redirect URI",
    minItems: 1,
  });
  if (!normalizedRedirectUris.ok) return normalizedRedirectUris;

  const normalizedPostLogoutRedirectUris = normalizeUriList(postLogoutRedirectUris, {
    fieldLabel: "post-logout redirect URI",
    minItems: 0,
  });
  if (!normalizedPostLogoutRedirectUris.ok) return normalizedPostLogoutRedirectUris;

  return {
    ok: true,
    data: {
      name,
      subdomain,
      redirectUris: normalizedRedirectUris.data,
      postLogoutRedirectUris: normalizedPostLogoutRedirectUris.data,
      sessionTimeout,
    },
  };
}

function normalizeSessionTimeout(value: unknown, fallback: number) {
  if (typeof value === "number" && Number.isInteger(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isInteger(parsed)) return parsed;
  }
  return fallback;
}

function normalizeOptionalUriList(value: unknown) {
  if (!Array.isArray(value)) return [];

  const normalized = normalizeUriList(value, {
    fieldLabel: "post-logout redirect URI",
    minItems: 0,
  });

  return normalized.ok ? normalized.data : [];
}

function normalizeUriList(
  values: unknown[],
  options: {
    fieldLabel: string;
    minItems: number;
    maxItems?: number;
  },
): { ok: true; data: string[] } | { ok: false; error: string } {
  const { fieldLabel, minItems, maxItems = 10 } = options;

  if (values.length < minItems || values.length > maxItems) {
    const range =
      minItems === 0
        ? `up to ${maxItems}`
        : `between ${minItems} and ${maxItems}`;
    return { ok: false, error: `Provide ${range} ${fieldLabel}${maxItems === 1 ? "" : "s"}.` };
  }

  const normalized: string[] = [];
  for (const value of values) {
    if (typeof value !== "string") {
      return { ok: false, error: `Each ${fieldLabel} must be a string.` };
    }

    const uri = value.trim();
    if (!uri || uri.length > 2048) {
      return { ok: false, error: `Each ${fieldLabel} must be between 1 and 2048 characters.` };
    }

    let parsed: URL;
    try {
      parsed = new URL(uri);
    } catch {
      return { ok: false, error: `Invalid ${fieldLabel}: ${uri}` };
    }

    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return { ok: false, error: `${capitalize(fieldLabel)} must use http or https: ${uri}` };
    }

    normalized.push(parsed.toString());
  }

  return { ok: true, data: Array.from(new Set(normalized)) };
}

function capitalize(value: string) {
  if (!value) return value;
  return value[0].toUpperCase() + value.slice(1);
}
