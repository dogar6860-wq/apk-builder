function gh(path) {
  return fetch("https://api.github.com" + path, {
    headers: {
      Authorization: "Bearer " + process.env.GH_TOKEN,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "apk-site",
    },
  });
}

const reply = (code, obj) => ({
  statusCode: code,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(obj),
});

exports.handler = async (event) => {
  const id = (event.queryStringParameters || {}).id || "";
  if (!/^[a-f0-9]{10}$/.test(id)) return reply(400, { error: "Bad id" });
  const repo = process.env.GH_REPO;

  // 1. finished? (release with the APK exists)
  const rel = await gh(`/repos/${repo}/releases/tags/build-${id}`);
  if (rel.ok) {
    const j = await rel.json();
    const a = (j.assets || [])[0];
    if (a) return reply(200, { state: "done", url: "/.netlify/functions/download?id=" + id, name: a.name });
  }

  // 2. otherwise look at the workflow run
  const runs = await gh(`/repos/${repo}/actions/workflows/build-apk.yml/runs?per_page=30`);
  if (runs.ok) {
    const j = await runs.json();
    const run = (j.workflow_runs || []).find((r) => (r.display_title || "").includes(id));
    if (run) {
      if (run.status !== "completed") return reply(200, { state: "building", logs: run.html_url });
      if (run.conclusion !== "success") return reply(200, { state: "failed", logs: run.html_url });
      return reply(200, { state: "building", logs: run.html_url });
    }
  }
  return reply(200, { state: "queued" });
};
