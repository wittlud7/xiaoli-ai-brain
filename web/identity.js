export function uniqueId() {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}
// Detect accidental source changes; this is not a security signature.
export function sourceVersion(source) {
  let hash = 2166136261;
  for (let i = 0; i < source.content.length; i++)
    hash = Math.imul(hash ^ source.content.charCodeAt(i), 16777619);
  return `${source.content.length}-${(hash >>> 0).toString(16)}`;
}
