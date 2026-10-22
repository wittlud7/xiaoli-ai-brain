export class ApiError extends Error {
  constructor(message, status, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}
let token = "";
export function setAccessToken(value) {
  token = value;
}

export async function request(path, body, { signal } = {}) {
  const hosted =
    globalThis.document?.documentElement?.dataset.hosting === "sites";
  const timeoutMs = path === "/api/config" ? 10000 : 140000;
  const response = await fetch(path, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)])
      : AbortSignal.timeout(timeoutMs),
    cache: "no-store",
  });
  let result;
  try {
    result = await response.json();
  } catch {
    if (response.status === 401 && hosted)
      throw new ApiError(
        "登录已过期，请重新使用 ChatGPT 登录。资料仍保存在此浏览器。",
        401,
        "LOGIN_REQUIRED",
      );
    throw new ApiError(
      "服务返回了无法读取的响应，请检查服务是否正常运行。",
      response.status,
    );
  }
  if (!response.ok) {
    if (response.status === 401 && (result.code === "LOGIN_REQUIRED" || hosted))
      throw new ApiError(
        "登录已过期，请重新使用 ChatGPT 登录。资料仍保存在此浏览器。",
        401,
        "LOGIN_REQUIRED",
      );
    if (response.status === 502 && result.code === "PROVIDER_AUTH")
      throw new ApiError(
        path.includes("audio")
          ? "语音服务拒绝了当前密钥。请在服务器更新 OPENAI_API_KEY，脚本已保留。"
          : "文本服务拒绝了当前密钥，请检查服务器配置和模型权限。资料未改变。",
        502,
      );
    if (response.status === 502 && result.code === "PROVIDER_NOT_FOUND")
      throw new ApiError(
        "当前模型或服务端点不可用，请检查服务器模型名称与服务地址。资料和脚本已保留。",
        502,
      );
    if (response.status === 502 && result.code === "PROVIDER_LIMIT")
      throw new ApiError(
        "供应商额度或速率受限，请检查余额并稍后重试。资料和脚本已保留。",
        502,
      );
    const message =
      response.status === 401
        ? "请先输入此工作区的访问口令。"
        : response.status === 429
          ? "请求较多或正在生成，请稍后重试。"
          : response.status === 502
            ? path.includes("audio")
              ? "语音服务未完成请求，脚本已保留。请检查语音密钥、额度和网络后重试。"
              : "模型未返回有效结果。请检查模型配置或重试，当前资料未改变。"
            : result.error || "请求失败，请稍后重试。";
    throw new ApiError(message, response.status);
  }
  return result;
}

export function audioBlob(data) {
  if (
    data?.mimeType !== "audio/mpeg" ||
    typeof data.data !== "string" ||
    data.data.length > 36 * 1024 * 1024
  )
    throw new Error("音频响应格式无效。");
  let bytes;
  try {
    bytes = Uint8Array.from(atob(data.data), (character) =>
      character.charCodeAt(0),
    );
  } catch {
    throw new Error("音频响应无法解码。");
  }
  if (!bytes.length) throw new Error("模型返回了空音频。");
  return new Blob([bytes], { type: "audio/mpeg" });
}
