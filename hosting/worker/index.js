// Hosted only behind Sites' owner-private access policy. Never publish this
// deployment with anonymous access while it uses the owner's provider key.
const buckets = new Map();
let active = 0;
const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/health")
      return json({ status: "ok", version: "0.2.0-beta.1" });
    if (!url.pathname.startsWith("/api/")) {
      if (!["GET", "HEAD"].includes(request.method))
        return new Response("Method not allowed", { status: 405 });
      const asset = ASSETS[url.pathname === "/" ? "/index.html" : url.pathname];
      if (!asset) return new Response("Not found", { status: 404 });
      const bytes = Uint8Array.from(atob(asset[1]), (c) => c.charCodeAt(0));
      return new Response(request.method === "HEAD" ? null : bytes, {
        headers: {
          "Content-Type": asset[0],
          "X-Content-Type-Options": "nosniff",
          "Referrer-Policy": "no-referrer",
          "Content-Security-Policy":
            "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; media-src 'self' data: blob:; worker-src 'self' blob:; connect-src 'self' blob:; object-src 'none'; base-uri 'none'; form-action 'self'",
        },
      });
    }
    // The platform strips visitor-supplied identity headers. Fail closed even
    // if a future owner changes the Site audience to public.
    const user = request.headers.get("oai-authenticated-user-id");
    if (!user) return json({ error: "请登录后使用学习工作台。" }, 401);
    if (
      request.headers.get("sec-fetch-site") === "cross-site" ||
      (request.headers.get("origin") &&
        request.headers.get("origin") !== url.origin)
    )
      return json({ error: "不允许跨站请求。" }, 403);
    if (url.pathname === "/api/config" && request.method === "GET")
      return json({
        version: "0.2.0-beta.1",
        textReady: Boolean(env.GEMINI_API_KEY),
        audioReady: false,
      });
    if (!["/api/study/generate", "/api/study/ask"].includes(url.pathname))
      return json({ error: "此线上版本暂不提供音频合成。" }, 404);
    if (request.method !== "POST")
      return json({ error: "Method not allowed" }, 405);
    const now = Date.now();
    for (const [id, bucket] of buckets)
      if (bucket.until <= now) buckets.delete(id);
    const bucket = buckets.get(user) || { count: 0, until: now + 60000 };
    buckets.set(user, bucket);
    if (++bucket.count > 20 || active >= 2)
      return json({ error: "请求较多，请稍后重试。" }, 429);
    if (!env.GEMINI_API_KEY)
      return json({ error: "服务端尚未配置 Gemini。" }, 503);
    active++;
    try {
      if (!request.headers.get("content-type")?.startsWith("application/json"))
        return json({ error: "请发送 JSON。" }, 400);
      const reader = request.body?.getReader();
      if (!reader) return json({ error: "请求不能为空。" }, 400);
      const chunks = [];
      let size = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 2 * 1024 * 1024) {
          await reader.cancel();
          return json({ error: "请求过大。" }, 413);
        }
        chunks.push(value);
      }
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
      }
      let body;
      try {
        body = JSON.parse(new TextDecoder().decode(bytes));
      } catch {
        return json({ error: "JSON 格式无效。" }, 400);
      }
      if (!body || typeof body !== "object" || Array.isArray(body))
        return json({ error: "请发送 JSON 对象。" }, 400);
      const signal = AbortSignal.any([
        request.signal,
        AbortSignal.timeout(120000),
      ]);
      const structured = async (prompt, system) => {
        const model = encodeURIComponent(
          env.GEMINI_MODEL || "gemini-3-flash-preview",
        );
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
          {
            method: "POST",
            signal,
            headers: {
              "Content-Type": "application/json",
              "x-goog-api-key": env.GEMINI_API_KEY,
            },
            body: JSON.stringify({
              contents: [{ role: "user", parts: [{ text: prompt }] }],
              systemInstruction: { parts: [{ text: system }] },
              generationConfig: {
                responseMimeType: "application/json",
                maxOutputTokens: 8192,
              },
            }),
          },
        );
        if (!response.ok) throw new Error("Provider request failed");
        const result = await response.json();
        return (
          result.candidates?.[0]?.content?.parts
            ?.map((p) => p.text || "")
            .join("") || ""
        );
      };
      return json(
        await (url.pathname.endsWith("/ask")
          ? studyAsk(body, structured)
          : studyGenerate(body, structured)),
      );
    } catch (error) {
      if (error.expose === true && error.status === 400)
        return json({ error: error.message }, 400);
      if (error.name === "TimeoutError" || error.name === "AbortError")
        return json({ error: "请求超时，请稍后重试。" }, 504);
      return json(
        {
          error: "AI 请求失败，请检查服务配置或稍后重试。",
          code: "PROVIDER_FAILURE",
        },
        502,
      );
    } finally {
      active--;
    }
  },
};
