
const SESSION_COOKIE_NAME =
  "__Secure-better-auth.session_token";

const REQUEST_TIMEOUT_MS = 15000;

let sessionCookie = null;
let loginPromise = null;

function getConfig() {
  const { PORTAL_BASE_URL, PORTAL_EMAIL, PORTAL_PASSWORD } =
    process.env;

  if (!PORTAL_BASE_URL || !PORTAL_EMAIL || !PORTAL_PASSWORD) {
    throw new Error(
      "Missing PORTAL_BASE_URL, PORTAL_EMAIL, or PORTAL_PASSWORD in .env"
    );
  }

  return {
    baseUrl: PORTAL_BASE_URL.replace(/\/+$/, ""),
    email: PORTAL_EMAIL,
    password: PORTAL_PASSWORD,
  };
}

async function fetchWithTimeout(url, options = {}) {
  return fetch(url, {
    ...options,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
}

export async function loginToPortal() {
  if (sessionCookie) {
    return;
  }

  if (loginPromise) {
    return loginPromise;
  }

  loginPromise = (async () => {
    const { baseUrl, email, password } = getConfig();

    const body = new URLSearchParams({
      email,
      password,
    });

    const response = await fetchWithTimeout(`${baseUrl}/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
        Origin: baseUrl,
        Referer: `${baseUrl}/login`,
        "X-SvelteKit-Action": "true",
      },
      body,
      redirect: "manual",
    });

    // Read cookie headers without printing their values.
    const cookies = response.headers.getSetCookie?.() ?? [];

    const session = cookies.find((cookie) =>
      cookie.startsWith(`${SESSION_COOKIE_NAME}=`)
    );

    if (response.status === 403) {
      throw new Error(
        "Portal login returned HTTP 403. The portal may require " +
          "initial page state, a CSRF token, or another required header."
      );
    }

    if (!response.ok) {
      throw new Error(
        `Portal login failed with HTTP ${response.status}.`
      );
    }

    if (!session) {
      throw new Error(
        "Portal login response did not contain the expected session cookie."
      );
    }

    sessionCookie = session.split(";")[0];
  })();

  try {
    await loginPromise;
  } finally {
    loginPromise = null;
  }
}

async function requestEnergy(url) {
  return fetchWithTimeout(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
      Cookie: sessionCookie,
    },
  });
}

export async function getMeterEnergy(meterId) {
  if (
    typeof meterId !== "string" ||
    meterId.trim().length === 0
  ) {
    throw new Error("A valid meter ID is required.");
  }

  const { baseUrl } = getConfig();

  const url = new URL(
    `/portal/meters/${encodeURIComponent(meterId.trim())}/energy`,
    baseUrl
  );

  await loginToPortal();

  let response = await requestEnergy(url);

  // Retry once if the session has expired or is rejected.
  if (response.status === 401 || response.status === 403) {
    sessionCookie = null;

    await loginToPortal();
    response = await requestEnergy(url);
  }

  if (!response.ok) {
    throw new Error(
      `Energy request for meter ${meterId} failed with HTTP ${response.status}.`
    );
  }

  return response.json();
}
