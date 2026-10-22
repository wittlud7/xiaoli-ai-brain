const TTS_MAX_CHARS = 3900;

function stripMarkdown(rawText) {
  return String(rawText || "")
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

export function chunkText(input, maxLength = TTS_MAX_CHARS) {
  if (!Number.isInteger(maxLength) || maxLength < 2)
    throw new RangeError("Chunk size must be at least 2.");
  const normalized = String(input || "").trim();
  if (!normalized) return [];
  if (normalized.length <= maxLength) return [normalized];

  const chunks = [];
  let remaining = normalized;

  while (remaining.length > maxLength) {
    const candidates = [
      remaining.lastIndexOf("。", maxLength - 1),
      remaining.lastIndexOf("！", maxLength - 1),
      remaining.lastIndexOf("？", maxLength - 1),
      remaining.lastIndexOf("；", maxLength - 1),
      remaining.lastIndexOf("，", maxLength - 1),
      remaining.lastIndexOf(".", maxLength - 1),
      remaining.lastIndexOf("!", maxLength - 1),
      remaining.lastIndexOf("?", maxLength - 1),
      remaining.lastIndexOf(";", maxLength - 1),
      remaining.lastIndexOf(",", maxLength - 1),
      remaining.lastIndexOf(" ", maxLength - 1),
    ];

    let cutIndex = Math.max(...candidates);
    if (cutIndex < Math.floor(maxLength * 0.55)) {
      cutIndex = maxLength;
    } else {
      cutIndex += 1;
    }

    if (
      /[\uD800-\uDBFF]/.test(remaining[cutIndex - 1]) &&
      /[\uDC00-\uDFFF]/.test(remaining[cutIndex])
    )
      cutIndex--;
    chunks.push(remaining.slice(0, cutIndex).trim());
    remaining = remaining.slice(cutIndex).trim();
  }

  if (remaining) {
    chunks.push(remaining);
  }

  return chunks;
}

export function buildSpeechSegments(rawText, env = process.env) {
  const HOST_A_VOICE = env.OPENAI_TTS_VOICE_HOST_A || "coral";
  const HOST_B_VOICE = env.OPENAI_TTS_VOICE_HOST_B || "verse";
  const FALLBACK_VOICE = env.OPENAI_TTS_VOICE_FALLBACK || HOST_A_VOICE;
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
        speaker: "hostA",
        text: line.replace(/^(主持人A|Joe)\s*[：:]\s*/i, "").trim(),
      };
    }

    if (/^(主持人B|Jane)\s*[：:]/i.test(line)) {
      return {
        speaker: "hostB",
        text: line.replace(/^(主持人B|Jane)\s*[：:]\s*/i, "").trim(),
      };
    }

    return {
      speaker: "narrator",
      text: line,
    };
  });

  const merged = parsed.reduce((acc, item) => {
    if (!item.text) return acc;
    const last = acc[acc.length - 1];
    if (last && last.speaker === item.speaker) {
      last.text = `${last.text} ${item.text}`.trim();
    } else {
      acc.push({ speaker: item.speaker, text: item.text });
    }
    return acc;
  }, []);

  const voiceConfig = {
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
