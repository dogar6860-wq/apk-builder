// Works with a PRIVATE repo: asks GitHub for a short-lived download link
// and sends the browser straight to it.
exports.handler = async (event) => {
  const id = (event.queryStringParameters || {}).id || "";
  if (!/^[a-f0-9]{10}$/.test(id)) return { statusCode: 400, body: "Bad id" };

  const repo = process.env.GH_REPO;
  const base = {
    Authorization: "Bearer " + process.env.GH_TOKEN,
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "apk-site",
  };

  const rel = await fetch(`https://api.github.com/repos/${repo}/releases/tags/build-${id}`, {
    headers: { ...base, Accept: "application/vnd.github+json" },
  });
  if (!rel.ok) return { statusCode: 404, body: "Build not found" };
  const asset = ((await rel.json()).assets || [])[0];
  if (!asset) return { statusCode: 404, body: "APK not found" };

  const r = await fetch(`https://api.github.com/repos/${repo}/releases/assets/${asset.id}`, {
    headers: { ...base, Accept: "application/octet-stream" },
    redirect: "manual",
  });
  const loc = r.headers.get("location");
  if (r.status >= 300 && r.status < 400 && loc) {
    return { statusCode: 302, headers: { Location: loc, "Cache-Control": "no-store" }, body: "" };
  }
  return { statusCode: 502, body: "Could not get the download link (GitHub " + r.status + ")" };
};
