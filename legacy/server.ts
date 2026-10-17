import express from "express";
import { createServer as createViteServer } from "vite";
import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config();

type SpeakerKey = "hostA" | "hostB" | "narrator";

type SpeechSegment = {
  speaker: SpeakerKey;
  voice: string;
  instructions: string;
  input: string;
};

const OPENAI_TTS_MODEL = process.env.OPENAI_TTS_MODEL || "gpt-4o-mini-tts";
const HOST_A_VOICE = process.env.OPENAI_TTS_VOICE_HOST_A || "coral";
const HOST_B_VOICE = process.env.OPENAI_TTS_VOICE_HOST_B || "verse";
const FALLBACK_VOICE = process.env.OPENAI_TTS_VOICE_FALLBACK || HOST_A_VOICE;
const TTS_MAX_CHARS = 3900;

function stripMarkdown(rawText: string): string {
  return rawText
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/#+\s/g, "")
    .replace(/\*\*/g, "")
    .replace(/\*/g, "")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\r/g, "")
    .replace(/\t+/g, " ")
    .replace(/[ ]{2,}/g, " ")
    .trim();
}

function chunkText(input: string, maxLength = TTS_MAX_CHARS): string[] {
  const normalized = input.trim();
  if (!normalized) return [];
  if (normalized.length <= maxLength) return [normalized];

  const chunks: string[] = [];
  let remaining = normalized;

  while (remaining.length > maxLength) {
    const candidates = [
      remaining.lastIndexOf("。", maxLength),
      remaining.lastIndexOf("！", maxLength),
      remaining.lastIndexOf("？", maxLength),
      remaining.lastIndexOf("；", maxLength),
      remaining.lastIndexOf("，", maxLength),
      remaining.lastIndexOf(".", maxLength),
      remaining.lastIndexOf("!", maxLength),
      remaining.lastIndexOf("?", maxLength),
      remaining.lastIndexOf(";", maxLength),
      remaining.lastIndexOf(",", maxLength),
      remaining.lastIndexOf(" ", maxLength),
    ];

    let cutIndex = Math.max(...candidates);
    if (cutIndex < Math.floor(maxLength * 0.55)) {
      cutIndex = maxLength;
    } else {
      cutIndex += 1;
    }

    chunks.push(remaining.slice(0, cutIndex).trim());
    remaining = remaining.slice(cutIndex).trim();
  }

  if (remaining) {
    chunks.push(remaining);
  }

  return chunks;
}

function buildSpeechSegments(rawText: unknown): SpeechSegment[] {
  if (typeof rawText !== "string") return [];

  const cleaned = stripMarkdown(rawText)
    .replace(/主持人 A/gi, "主持人A")
    .replace(/主持人 B/gi, "主持人B")
    .replace(/Host A/gi, "主持人A")
    .replace(/Host B/gi, "主持人B");

  const lines = cleaned
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  const parsed = lines.map((line) => {
    if (/^(主持人A|Joe)\s*[：:]/i.test(line)) {
      return {
        speaker: "hostA" as const,
        text: line.replace(/^(主持人A|Joe)\s*[：:]\s*/i, "").trim(),
      };
    }

    if (/^(主持人B|Jane)\s*[：:]/i.test(line)) {
      return {
        speaker: "hostB" as const,
        text: line.replace(/^(主持人B|Jane)\s*[：:]\s*/i, "").trim(),
      };
    }

    return {
      speaker: "narrator" as const,
      text: line,
    };
  });

  const merged = parsed.reduce<Array<{ speaker: SpeakerKey; text: string }>>((acc, item) => {
    if (!item.text) return acc;
    const last = acc[acc.length - 1];
    if (last && last.speaker === item.speaker) {
      last.text = `${last.text} ${item.text}`.trim();
    } else {
      acc.push({ speaker: item.speaker, text: item.text });
    }
    return acc;
  }, []);

  if (!merged.length) {
    return [];
  }

  const voiceConfig: Record<SpeakerKey, { voice: string; instructions: string }> = {
    hostA: {
      voice: HOST_A_VOICE,
      instructions:
        "Voice Affect: Warm and upbeat. Tone: Confident study host. Pacing: Conversational and clear. Emphasis: Highlight key ideas and transitions.",
    },
    hostB: {
      voice: HOST_B_VOICE,
      instructions:
        "Voice Affect: Bright and curious. Tone: Playful and supportive co-host. Pacing: Slightly brisk but easy to follow. Emphasis: React naturally to examples and surprises.",
    },
    narrator: {
      voice: FALLBACK_VOICE,
      instructions:
        "Voice Affect: Warm and reassuring. Tone: Friendly learning companion. Pacing: Moderate, precise, easy for students to follow.",
    },
  };

  return merged.flatMap((item) =>
    chunkText(item.text).map((chunk) => ({
      speaker: item.speaker,
      voice: voiceConfig[item.speaker].voice,
      instructions: voiceConfig[item.speaker].instructions,
      input: chunk,
    })),
  );
}

async function synthesizeSpeech(segments: SpeechSegment[]): Promise<{ data: string; mimeType: string }> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OpenAI API Key is missing.");
  }

  const audioParts: Buffer[] = [];

  for (const segment of segments) {
    const response = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: OPENAI_TTS_MODEL,
        voice: segment.voice,
        input: segment.input,
        instructions: segment.instructions,
        response_format: "mp3",
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText || `OpenAI TTS failed with status ${response.status}.`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    audioParts.push(buffer);
  }

  return {
    data: Buffer.concat(audioParts).toString("base64"),
    mimeType: "audio/mpeg",
  };
}

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT || 3000);

  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  app.get("/health", (_req, res) => {
    res.json({
      status: "ok",
      service: "xiaoli-ai-brain",
      port: PORT,
      ttsProvider: "openai",
      hasGeminiKey: Boolean(process.env.GEMINI_API_KEY),
      hasOpenAIKey: Boolean(process.env.OPENAI_API_KEY),
    });
  });

  app.post("/api/anthropic/generate", async (req, res) => {
    try {
      const apiKey = process.env.ANTHROPIC_AUTH_TOKEN;
      const baseURL = process.env.ANTHROPIC_BASE_URL;

      if (!apiKey) {
        return res.status(500).json({ error: "Anthropic API Key is missing." });
      }

      const anthropic = new Anthropic({
        apiKey,
        baseURL: baseURL || undefined,
        defaultHeaders: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        },
      });

      const { prompt, system, max_tokens } = req.body;

      const response = await anthropic.messages.create({
        model: "claude-sonnet-4-5",
        max_tokens: max_tokens || 4096,
        system,
        messages: [{ role: "user", content: prompt }],
      });

      res.json(response);
    } catch (error: any) {
      console.error("Anthropic API Error:", error);
      res.status(500).json({ error: error?.message || "Failed to generate content" });
    }
  });

  app.post("/api/gemini/generate", async (req, res) => {
    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return res.status(500).json({ error: "Gemini API Key is missing." });
      }

      const { prompt, systemInstruction } = req.body as {
        prompt?: unknown;
        systemInstruction?: unknown;
      };

      if (typeof prompt !== "string" || !prompt.trim()) {
        return res.status(400).json({ error: "prompt is required." });
      }

      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
        config:
          typeof systemInstruction === "string" && systemInstruction.trim()
            ? { systemInstruction }
            : undefined,
      });

      res.json({ text: response.text || "" });
    } catch (error: any) {
      console.error("Gemini generate error:", error);
      res.status(500).json({ error: error?.message || "Failed to generate content" });
    }
  });

  const podcastTtsHandler = async (req: express.Request, res: express.Response) => {
    try {
      const { text } = req.body as { text?: unknown };
      const segments = buildSpeechSegments(text);

      if (!segments.length) {
        return res.status(400).json({ error: "text is empty." });
      }

      const audio = await synthesizeSpeech(segments);
      res.json(audio);
    } catch (error: any) {
      console.error("Podcast TTS error:", error);
      res.status(500).json({ error: error?.message || "Failed to generate audio" });
    }
  };

  app.post("/api/audio/podcast-tts", podcastTtsHandler);
  app.post("/api/gemini/tts", podcastTtsHandler);

  app.post("/api/gemini/knowledge-summary", async (req, res) => {
    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return res.status(500).json({ error: "Gemini API Key is missing." });
      }

      const { term } = req.body as { term?: unknown };
      if (typeof term !== "string" || !term.trim()) {
        return res.status(400).json({ error: "term is required." });
      }

      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `请为名词 "${term}" 总结出 3-5 个核心知识点或定义，便于记忆。请用简洁的短句表达。`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              points: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: "核心知识点列表",
              },
            },
            required: ["points"],
          },
        },
      });

      const parsed = response.text ? JSON.parse(response.text) : null;
      res.json({ points: Array.isArray(parsed?.points) ? parsed.points : [] });
    } catch (error: any) {
      console.error("Gemini knowledge-summary error:", error);
      res.status(500).json({ error: error?.message || "Failed to generate summary" });
    }
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      root: __dirname,
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(join(__dirname, "dist")));
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
