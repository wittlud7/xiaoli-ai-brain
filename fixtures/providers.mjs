// Deterministic test providers. Never selected by the production server.
export async function structuredFixture(prompt, _system, signal) {
  const input = JSON.parse(prompt);
  if (input.goal?.includes("慢速"))
    await new Promise((resolve, reject) => {
      const timer = setTimeout(resolve, 700);
      signal?.addEventListener(
        "abort",
        () => {
          clearTimeout(timer);
          reject(signal.reason);
        },
        { once: true },
      );
    });
  const reference = input.excerpts[0];
  const ref = reference.id;
  const title = `${reference.sourceName.slice(0, 35)} · 学习成果`;
  if (input.task === "map")
    return JSON.stringify({
      title,
      concepts: [
        {
          id: "force",
          name: "合外力",
          description: "所有外力的矢量和。",
          sourceRefs: [ref],
        },
        {
          id: "acceleration",
          name: "加速度",
          description: "速度随时间的变化率。",
          sourceRefs: [ref],
        },
      ],
      links: [{ from: "force", to: "acceleration", label: "决定" }],
    });
  if (input.task === "cards")
    return JSON.stringify({
      title,
      cards: [
        {
          question: "牛顿第二定律怎样表达？",
          answer: "合外力等于质量与加速度的乘积：F = ma。",
          sourceRefs: [ref],
        },
        {
          question: "合力为零时速度一定为零吗？",
          answer: "不一定，物体可能保持非零的恒定速度。",
          sourceRefs: [ref],
        },
      ],
    });
  if (input.task === "podcast")
    return JSON.stringify({
      title,
      script:
        "主持人A：今天一起学习力与运动。\n主持人B：先确定研究对象，再画受力图。",
      sourceRefs: [ref],
    });
  return JSON.stringify({
    title,
    markdown: `## ${input.question ? "回答你的问题" : "核心概念"}\n\n${input.question ? `问题：${input.question}\n\n` : ""}牛顿第二定律描述合外力与加速度的关系。[${ref}]\n\n- 先画受力图，再列出方程。[${ref}]`,
  });
}

export function speechFixture() {
  // PCM WAV silence is sniffed by Chromium; API envelope is intentionally mocked.
  const length = 16000 * 3;
  const wav = Buffer.alloc(44 + length * 2);
  wav.write("RIFF", 0);
  wav.writeUInt32LE(wav.length - 8, 4);
  wav.write("WAVEfmt ", 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(16000, 24);
  wav.writeUInt32LE(32000, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write("data", 36);
  wav.writeUInt32LE(length * 2, 40);
  return { data: wav.toString("base64"), mimeType: "audio/mpeg" };
}
