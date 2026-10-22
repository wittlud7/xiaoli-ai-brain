import express from "express";
import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";
import { timingSafeEqual } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { buildSpeechSegments } from "./lib/speech.mjs";
import { studyGenerate, studyAsk } from "./lib/study.mjs";

const root = dirname(fileURLToPath(import.meta.url));
const pdfRoot = dirname(
  fileURLToPath(import.meta.resolve("pdfjs-dist/package.json")),
);
dotenv.config({ quiet: true });

function fail(status, message) {
  return Object.assign(new Error(message), { status, expose: true });
}
function text(value, name, max = 32000, optional = false) {
  if (optional && value === undefined) return undefined;
  if (typeof value !== "string" || !value.trim() || value.length > max)
    throw fail(
      400,
      `${name} must be non-empty text of at most ${max} characters.`,
    );
  return value.trim();
}
function sameToken(actual, expected) {
  const a = Buffer.from(actual),
    b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
export function validateBinding(env) {
  const host = env.HOST || "127.0.0.1";
  const token = env.APP_ACCESS_TOKEN || "";
  if (token && token.length < 24)
    throw new Error("APP_ACCESS_TOKEN must have at least 24 characters.");
  if (!["127.0.0.1", "::1", "localhost"].includes(host) && !token)
    throw new Error(
      "A public HOST requires APP_ACCESS_TOKEN (at least 24 characters).",
    );
  if (env.PUBLIC_ORIGIN) {
    const url = new URL(env.PUBLIC_ORIGIN);
    if (
      !["https:", "http:"].includes(url.protocol) ||
      url.origin !== env.PUBLIC_ORIGIN
    )
      throw new Error(
        "PUBLIC_ORIGIN must be an HTTP(S) origin without a trailing slash.",
      );
  }
  return host;
}
export function createApp({
  env = process.env,
  providers = {},
  rateLimit = 20,
  windowMs = 60000,
  maxConcurrent = 2,
  requestTimeoutMs = 120000,
} = {}) {
  validateBinding(env);
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", false);
  app.use((_req, res, next) => {
    res.set({
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      "Referrer-Policy": "no-referrer",
      "Content-Security-Policy":
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data:; media-src 'self' data: blob:; worker-src 'self' blob:; connect-src 'self' blob:; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
    });
    next();
  });
  app.get("/health", (_req, res) =>
    res.json({
      status: "ok",
      service: "xiaoli-ai-brain",
      version: "0.2.0-beta.1",
    }),
  );
  const buckets = new Map();
  let active = 0;
  app.use("/api", (req, res, next) => {
    res.set("Cache-Control", "no-store");
    const origin = req.get("origin");
    if (
      req.get("sec-fetch-site") === "cross-site" ||
      (origin &&
        origin !==
          (env.PUBLIC_ORIGIN || `${req.protocol}://${req.get("host")}`))
    )
      return next(fail(403, "Cross-site requests are not allowed."));
    // Block DNS rebinding against an unauthenticated local server.
    const hostname = req.hostname.replace(/^\[|\]$/g, "");
    if (
      !env.APP_ACCESS_TOKEN &&
      !["localhost", "127.0.0.1", "::1"].includes(hostname)
    )
      return next(fail(403, "Unrecognized local host."));
    if (
      env.APP_ACCESS_TOKEN &&
      !sameToken(
        req.get("authorization") || "",
        `Bearer ${env.APP_ACCESS_TOKEN}`,
      )
    )
      return next(fail(401, "Enter the workspace access key to continue."));
    const now = Date.now();
    for (const [key, bucket] of buckets)
      if (bucket.until <= now) buckets.delete(key);
    const key = req.ip;
    let bucket = buckets.get(key);
    if (!bucket) {
      if (buckets.size >= 10000)
        return next(fail(503, "Server is busy. Try again shortly."));
      bucket = { count: 0, until: now + windowMs };
      buckets.set(key, bucket);
    }
    if (++bucket.count > rateLimit) {
      res.set("Retry-After", String(Math.ceil((bucket.until - now) / 1000)));
      return next(fail(429, "Too many requests. Try again shortly."));
    }
    next();
  });
  app.use("/api/study", express.json({ limit: "2mb", strict: true }));
  app.use("/api", express.json({ limit: "256kb", strict: true }));
  app.use("/api", (req, _res, next) => {
    if (
      req.method === "POST" &&
      (!req.is("application/json") || !req.body || Array.isArray(req.body))
    )
      return next(
        fail(400, "Send a JSON object with Content-Type application/json."),
      );
    next();
  });
  const route = (handler) => async (req, res, next) => {
    if (active >= maxConcurrent)
      return next(fail(429, "Generation is busy. Try again shortly."));
    active++;
    const controller = new AbortController();
    const signal = AbortSignal.any([
      controller.signal,
      AbortSignal.timeout(requestTimeoutMs),
    ]);
    const onClose = () => {
      if (!res.writableEnded) controller.abort();
    };
    res.on("close", onClose);
    try {
      const result = await Promise.race([
        handler(req.body || {}, signal),
        new Promise((_, reject) => {
          if (signal.aborted) reject(signal.reason);
          else
            signal.addEventListener("abort", () => reject(signal.reason), {
              once: true,
            });
        }),
      ]);
      if (!res.destroyed) res.json(result);
    } catch (error) {
      if (!res.destroyed)
        next(
          signal.aborted && !controller.signal.aborted
            ? fail(504, "请求超时，请缩短资料或稍后重试。")
            : error,
        );
    } finally {
      active--;
      res.off("close", onClose);
    }
  };
  async function generate(prompt, systemInstruction, json = false, signal) {
    if (providers.generate)
      return providers.generate(prompt, systemInstruction, json, signal);
    if (!env.GEMINI_API_KEY)
      throw fail(
        503,
        "Text generation is not configured. Set GEMINI_API_KEY on the server.",
      );
    const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
    const response = await ai.models.generateContent({
      model: env.GEMINI_MODEL || "gemini-3-flash-preview",
      contents: prompt,
      config: {
        systemInstruction,
        abortSignal: signal,
        maxOutputTokens: 4096,
        httpOptions: { timeout: 60000, retryOptions: { attempts: 1 } },
        ...(json
          ? {
              responseMimeType: "application/json",
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  points: { type: Type.ARRAY, items: { type: Type.STRING } },
                },
                required: ["points"],
              },
            }
          : {}),
      },
    });
    return response.text || "";
  }
  async function structured(prompt, system, signal) {
    if (providers.structured)
      return providers.structured(prompt, system, signal);
    if (providers.generate)
      return providers.generate(prompt, system, true, signal);
    const provider =
      env.STUDY_PROVIDER || (env.GEMINI_API_KEY ? "gemini" : "anthropic");
    if (provider === "anthropic") {
      if (!env.ANTHROPIC_AUTH_TOKEN)
        throw fail(
          503,
          "尚未配置文本模型，请在 .env 中填写 Gemini 或 Anthropic 密钥。",
        );
      const client = new Anthropic({
        apiKey: env.ANTHROPIC_AUTH_TOKEN,
        baseURL: env.ANTHROPIC_BASE_URL || undefined,
        timeout: 60000,
        maxRetries: 0,
      });
      const result = await client.messages.create(
        {
          model: env.ANTHROPIC_MODEL || "claude-sonnet-4-5",
          max_tokens: 4096,
          system,
          messages: [{ role: "user", content: prompt }],
        },
        { signal },
      );
      return result.content
        .filter((item) => item.type === "text")
        .map((item) => item.text)
        .join("");
    }
    if (provider !== "gemini")
      throw fail(503, "STUDY_PROVIDER 仅支持 gemini 或 anthropic。");
    if (!env.GEMINI_API_KEY) throw fail(503, "尚未配置 Gemini 密钥。");
    const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
    const result = await ai.models.generateContent({
      model: env.GEMINI_MODEL || "gemini-3-flash-preview",
      contents: prompt,
      config: {
        systemInstruction: system,
        responseMimeType: "application/json",
        maxOutputTokens: 8192,
        abortSignal: signal,
        httpOptions: { timeout: 60000, retryOptions: { attempts: 1 } },
      },
    });
    return result.text || "";
  }
  app.get("/api/config", (_req, res) => {
    const provider =
      env.STUDY_PROVIDER || (env.GEMINI_API_KEY ? "gemini" : "anthropic");
    res.json({
      version: "0.2.0-beta.1",
      textReady: Boolean(
        providers.structured ||
        providers.generate ||
        (provider === "gemini"
          ? env.GEMINI_API_KEY
          : provider === "anthropic" && env.ANTHROPIC_AUTH_TOKEN),
      ),
      audioReady: Boolean(providers.speech || env.OPENAI_API_KEY),
    });
  });
  app.post(
    "/api/study/generate",
    route((body, signal) =>
      studyGenerate(body, (prompt, system) =>
        structured(prompt, system, signal),
      ),
    ),
  );
  app.post(
    "/api/study/ask",
    route((body, signal) =>
      studyAsk(body, (prompt, system) => structured(prompt, system, signal)),
    ),
  );
  app.post(
    "/api/gemini/generate",
    route(async (body, signal) => ({
      text: await generate(
        text(body.prompt, "prompt"),
        text(body.systemInstruction, "systemInstruction", 4000, true),
        false,
        signal,
      ),
    })),
  );
  app.post(
    "/api/gemini/knowledge-summary",
    route(async (body, signal) => {
      const term = text(body.term, "term", 200);
      const result = JSON.parse(
        await generate(
          `Summarize the concept ${JSON.stringify(term)} in Chinese with 4 short bullet points for a student review card.`,
          undefined,
          true,
          signal,
        ),
      );
      if (
        !Array.isArray(result.points) ||
        result.points.some((x) => typeof x !== "string")
      )
        throw new Error("Invalid provider response");
      return { points: result.points };
    }),
  );
  app.post(
    "/api/anthropic/generate",
    route(async (body, signal) => {
      const prompt = text(body.prompt, "prompt"),
        system = text(body.system, "system", 4000, true);
      const maxTokens = body.max_tokens ?? 2048;
      if (!Number.isInteger(maxTokens) || maxTokens < 1 || maxTokens > 4096)
        throw fail(400, "max_tokens must be an integer between 1 and 4096.");
      if (providers.anthropic)
        return providers.anthropic(prompt, system, maxTokens, signal);
      if (!env.ANTHROPIC_AUTH_TOKEN)
        throw fail(503, "Anthropic is not configured on this server.");
      const anthropic = new Anthropic({
        apiKey: env.ANTHROPIC_AUTH_TOKEN,
        baseURL: env.ANTHROPIC_BASE_URL || undefined,
        timeout: 60000,
        maxRetries: 0,
      });
      return anthropic.messages.create(
        {
          model: env.ANTHROPIC_MODEL || "claude-sonnet-4-5",
          max_tokens: maxTokens,
          system,
          messages: [{ role: "user", content: prompt }],
        },
        { signal },
      );
    }),
  );
  const tts = route(async (body, signal) => {
    const segments = buildSpeechSegments(text(body.text, "text", 12000), env);
    if (!segments.length || segments.length > 24)
      throw fail(400, "Use between 1 and 24 speech segments.");
    if (providers.speech) return providers.speech(segments, signal);
    if (!env.OPENAI_API_KEY)
      throw fail(
        503,
        "Audio generation is not configured. Set OPENAI_API_KEY on the server.",
      );
    const parts = [];
    let totalBytes = 0;
    for (const segment of segments) {
      const response = await fetch("https://api.openai.com/v1/audio/speech", {
        method: "POST",
        signal,
        headers: {
          Authorization: `Bearer ${env.OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: env.OPENAI_TTS_MODEL || "gpt-4o-mini-tts",
          voice: segment.voice,
          input: segment.input,
          instructions: segment.instructions,
          response_format: "mp3",
        }),
      });
      if (!response.ok)
        throw Object.assign(new Error("Speech provider request failed"), {
          providerStatus: response.status,
        });
      if (!response.body) throw new Error("Speech response is empty");
      for await (const chunk of response.body) {
        totalBytes += chunk.length;
        if (totalBytes > 25 * 1024 * 1024)
          throw new Error("Speech response too large");
        parts.push(Buffer.from(chunk));
      }
    }
    return {
      data: Buffer.concat(parts).toString("base64"),
      mimeType: "audio/mpeg",
    };
  });
  app.post("/api/audio/podcast-tts", tts);
  app.post("/api/gemini/tts", tts);
  app.use("/api", (_req, _res, next) =>
    next(fail(404, "API route not found.")),
  );
  for (const directory of ["build", "cmaps", "standard_fonts"])
    app.use(
      `/vendor/pdfjs/${directory}`,
      express.static(join(pdfRoot, directory), {
        index: false,
        dotfiles: "deny",
      }),
    );
  app.use(express.static(join(root, "web"), { dotfiles: "deny" }));
  app.use((_req, _res, next) => next(fail(404, "Not found.")));
  app.use((error, _req, res, _next) => {
    const status =
      error.type === "entity.too.large"
        ? 413
        : error.type === "entity.parse.failed"
          ? 400
          : error.expose === true &&
              [400, 401, 403, 404, 429, 503, 504].includes(error.status)
            ? error.status
            : 502;
    const message =
      error.type === "entity.too.large"
        ? "Request body is too large."
        : error.type === "entity.parse.failed"
          ? "Invalid JSON."
          : status === 502
            ? "AI provider request failed. Check server configuration and retry."
            : error.message;
    if (status === 502)
      console.error("AI request failed:", error.name || "Error");
    const upstreamStatus =
      error.providerStatus || (!error.expose ? error.status : undefined);
    const code =
      status === 502
        ? [401, 403].includes(upstreamStatus)
          ? "PROVIDER_AUTH"
          : upstreamStatus === 404
            ? "PROVIDER_NOT_FOUND"
            : upstreamStatus === 429
              ? "PROVIDER_LIMIT"
              : "PROVIDER_FAILURE"
        : undefined;
    res.status(status).json({ error: message, ...(code ? { code } : {}) });
  });
  return app;
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const host = validateBinding(process.env),
      port = Number(process.env.PORT || 3000);
    if (!Number.isInteger(port) || port < 1 || port > 65535)
      throw new Error("PORT must be between 1 and 65535.");
    const server = createApp().listen(port, host, () =>
      console.log(
        `XiaoLi AI Brain: http://${host.includes(":") ? `[${host}]` : host}:${port}`,
      ),
    );
    server.on("error", (error) => {
      console.error("Server failed:", error.code);
      process.exitCode = 1;
    });
    for (const signal of ["SIGINT", "SIGTERM"])
      process.once(signal, () => {
        server.close(() => process.exit(0));
        setTimeout(() => process.exit(1), 5000).unref();
      });
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
