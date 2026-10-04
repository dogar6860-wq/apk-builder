const crypto = require("crypto");

function gh(path, opts = {}) {
  return fetch("https://api.github.com" + path, {
    ...opts,
    headers: {
      Authorization: "Bearer " + process.env.GH_TOKEN,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "apk-site",
      ...(opts.headers || {}),
    },
  });
}

const reply = (code, obj) => ({
  statusCode: code,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(obj),
});

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return reply(405, { error: "POST only" });

  let b;
  try { b = JSON.parse(event.body || "{}"); } catch { return reply(400, { error: "Bad request" }); }

  if (!process.env.ACCESS_PASSWORD || b.password !== process.env.ACCESS_PASSWORD) {
    return reply(401, { error: "Wrong password" });
  }
  if (!process.env.GH_TOKEN || !process.env.GH_REPO) {
    return reply(500, { error: "Site is missing GH_TOKEN or GH_REPO settings" });
  }

  const url = String(b.url || "").trim();
  const name = String(b.name || "").trim().slice(0, 40);
  const mode = b.mode === "live" ? "live" : "bundled";
  if (!/^https:\/\/[^\s]+$/.test(url)) return reply(400, { error: "Link must start with https://" });
  if (!name) return reply(400, { error: "Enter an app name" });

  // Same name = same package id, so new builds update the old app
  let slug = name.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 30) || "app";
  if (!/^[a-z]/.test(slug)) slug = "app" + slug;
  const appId = "com.apkbuilder." + slug;

  const repo = process.env.GH_REPO;
  const ref = process.env.GH_BRANCH || "main";
  const requestId = crypto.randomBytes(5).toString("hex");

  let iconPath = "";
  if (b.icon) {
    const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(b.icon);
    if (!m) return reply(400, { error: "Icon must be a PNG/JPG image" });
    iconPath = "icons/" + requestId + ".png";
    const r = await gh(`/repos/${repo}/contents/${iconPath}`, {
      method: "PUT",
      body: JSON.stringify({ message: "icon " + requestId, content: m[1], branch: ref }),
    });
    if (!r.ok) return reply(502, { error: "Could not save icon (GitHub " + r.status + ")" });
  }

  const r = await gh(`/repos/${repo}/actions/workflows/build-apk.yml/dispatches`, {
    method: "POST",
    body: JSON.stringify({
      ref,
      inputs: { url, app_name: name, app_id: appId, mode, icon_path: iconPath, request_id: requestId },
    }),
  });
  if (r.status !== 204) {
    const t = (await r.text()).slice(0, 200);
    return reply(502, { error: "GitHub said " + r.status + ": " + t });
  }
  return reply(200, { requestId, appId });
};
