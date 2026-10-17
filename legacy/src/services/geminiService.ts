export interface KnowledgeSummary {
  term: string;
  summary: string[];
}

export type GeneratedAudio = {
  data: string;
  mimeType: string;
};

type ApiErrorShape = { error?: string; message?: string };

async function postJSON<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const raw = await response.text();
  const parsed = raw ? JSON.parse(raw) : null;

  if (!response.ok) {
    const error = (parsed || {}) as ApiErrorShape;
    throw new Error(error.error || error.message || `Request failed (${response.status}).`);
  }

  return parsed as T;
}

export async function generateAIContent(
  prompt: string,
  systemInstruction?: string,
): Promise<string> {
  const data = await postJSON<{ text: string }>("/api/gemini/generate", {
    prompt,
    systemInstruction,
  });

  return data?.text || "";
}

export async function generateAudioContent(text: string): Promise<GeneratedAudio | null> {
  try {
    const data = await postJSON<GeneratedAudio>("/api/audio/podcast-tts", { text });
    return data?.data ? data : null;
  } catch (error) {
    console.error("Error generating audio content:", error);
    return null;
  }
}

export async function generateKnowledgeSummary(term: string): Promise<string[]> {
  try {
    const data = await postJSON<{ points: string[] }>("/api/gemini/knowledge-summary", { term });
    return Array.isArray(data?.points) ? data.points : [];
  } catch (error) {
    console.error("Error generating knowledge summary:", error);
    return ["无法生成总结，请稍后重试。"];
  }
}
