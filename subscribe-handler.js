const MAILERLITE_API_URL = "https://connect.mailerlite.com/api/subscribers";
const DEFAULT_GROUP_ID = "185943967072781503";
const REQUEST_TIMEOUT_MS = 8000;

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

function readStream(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
    });
    req.on("end", () => resolve(raw));
    req.on("error", reject);
  });
}

function parseUrlEncoded(raw) {
  const params = new URLSearchParams(raw);
  return Object.fromEntries(params.entries());
}

async function parseRequestBody(req) {
  if (req.body && typeof req.body === "object" && !Buffer.isBuffer(req.body)) {
    return req.body;
  }

  const raw =
    typeof req.body === "string"
      ? req.body
      : Buffer.isBuffer(req.body)
        ? req.body.toString("utf8")
        : await readStream(req);

  if (!raw) {
    return {};
  }

  const contentType = String(req.headers["content-type"] || "")
    .split(";")[0]
    .trim()
    .toLowerCase();

  if (contentType === "application/json") {
    return JSON.parse(raw);
  }

  if (contentType === "application/x-www-form-urlencoded") {
    return parseUrlEncoded(raw);
  }

  try {
    return JSON.parse(raw);
  } catch {
    return parseUrlEncoded(raw);
  }
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isAcceptableDuplicate(statusCode, payloadText) {
  if (statusCode !== 422) {
    return false;
  }

  const normalized = payloadText.toLowerCase();
  return (
    normalized.includes("already") ||
    normalized.includes("exists") ||
    normalized.includes("duplicate")
  );
}

async function subscribeEmail(email) {
  const token = process.env.MAILERLITE_API_TOKEN;
  const groupId = process.env.MAILERLITE_GROUP_ID || DEFAULT_GROUP_ID;

  if (!token) {
    throw new Error("Missing MAILERLITE_API_TOKEN");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(MAILERLITE_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        email,
        groups: [groupId],
        fields: {},
      }),
      signal: controller.signal,
    });

    const responseText = await response.text();

    if (response.ok || isAcceptableDuplicate(response.status, responseText)) {
      return { ok: true };
    }

    const error = new Error(`MailerLite request failed with status ${response.status}`);
    error.statusCode = response.status;
    error.responseText = responseText;
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function handleSubscribePayload(payload) {
  const email = String(payload.email || "").trim().toLowerCase();

  if (!email || !isValidEmail(email)) {
    return {
      statusCode: 422,
      body: {
        ok: false,
        error: "Please enter a valid email address.",
      },
    };
  }

  try {
    await subscribeEmail(email);
    return {
      statusCode: 200,
      body: { ok: true },
    };
  } catch (error) {
    const statusCode = error && typeof error.statusCode === "number" ? error.statusCode : 500;
    const responseText = error && typeof error.responseText === "string" ? error.responseText : "";

    console.error("MailerLite subscribe error", {
      message: error instanceof Error ? error.message : String(error),
      statusCode,
      responseText,
    });

    if (statusCode === 401) {
      return {
        statusCode: 500,
        body: {
          ok: false,
          error: "The signup service is unavailable right now. Please try again shortly.",
        },
      };
    }

    if (statusCode === 422) {
      return {
        statusCode: 422,
        body: {
          ok: false,
          error: "Please enter a valid email address.",
        },
      };
    }

    if (error instanceof Error && error.name === "AbortError") {
      return {
        statusCode: 504,
        body: {
          ok: false,
          error: "That took too long. Please try again.",
        },
      };
    }

    return {
      statusCode: 500,
      body: {
        ok: false,
        error: "Something went wrong. Please try again in a moment.",
      },
    };
  }
}

async function handleSubscribe(req, res) {
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method !== "POST") {
    sendJson(res, 405, { ok: false, error: "Method not allowed" });
    return;
  }

  try {
    const body = await parseRequestBody(req);
    const result = await handleSubscribePayload(body);
    sendJson(res, result.statusCode, result.body);
  } catch (error) {
    sendJson(res, 500, {
      ok: false,
      error: "Something went wrong. Please try again in a moment.",
    });
  }
}

module.exports = {
  handleSubscribe,
  handleSubscribePayload,
};
