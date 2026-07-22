import { unzipSync } from 'fflate';
import { GitHubInfraError } from './errors.js';
import type { ArtifactLimits } from './contracts.js';

const decoder = new TextDecoder();
const u16 = (v: DataView, o: number) => v.getUint16(o, true);
const u32 = (v: DataView, o: number) => v.getUint32(o, true);

export function readJsonFromZip(bytes: Uint8Array, path: string, limits: ArtifactLimits): { schema?: string; payload: unknown } {
  if (bytes.byteLength > limits.maxArchiveBytes) throw new GitHubInfraError('artifact-limit-exceeded', 'GitHub artifact archive exceeds maxArchiveBytes');
  const entries = inspectCentralDirectory(bytes, limits);
  const matches = entries.filter((entry) => entry.name === path);
  if (matches.length !== 1) throw new GitHubInfraError('artifact-invalid', matches.length === 0 ? `Artifact path not found: ${path}` : `Artifact path is duplicated: ${path}`);
  const files = unzipSync(bytes);
  const data = files[path];
  if (!data) throw new GitHubInfraError('artifact-invalid', `Artifact path could not be extracted: ${path}`);
  if (data.byteLength > limits.maxEntryBytes) throw new GitHubInfraError('artifact-limit-exceeded', 'Artifact entry exceeds maxEntryBytes');
  let payload: unknown;
  try { payload = JSON.parse(decoder.decode(data)); } catch { throw new GitHubInfraError('artifact-invalid', 'Artifact entry is not valid JSON'); }
  const schema = payload && typeof payload === 'object' && !Array.isArray(payload) && typeof (payload as Record<string, unknown>).schema === 'string' ? (payload as Record<string, string>).schema : undefined;
  return { schema, payload };
}

function inspectCentralDirectory(bytes: Uint8Array, limits: ArtifactLimits): Array<{ name: string; uncompressed: number }> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let i = bytes.byteLength - 22; i >= Math.max(0, bytes.byteLength - 65557); i -= 1) if (u32(view, i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new GitHubInfraError('artifact-invalid', 'Artifact is not a supported ZIP archive');
  const count = u16(view, eocd + 10); const size = u32(view, eocd + 12); const offset = u32(view, eocd + 16);
  if (count > limits.maxEntries || offset + size > bytes.byteLength) throw new GitHubInfraError('artifact-limit-exceeded', 'Artifact ZIP entry count or directory exceeds limits');
  const names = new Set<string>(); const result: Array<{ name: string; uncompressed: number }> = []; let cursor = offset; let total = 0;
  for (let i = 0; i < count; i += 1) {
    if (u32(view, cursor) !== 0x02014b50) throw new GitHubInfraError('artifact-invalid', 'Artifact ZIP central directory is malformed');
    const nameLength = u16(view, cursor + 28); const extraLength = u16(view, cursor + 30); const commentLength = u16(view, cursor + 32);
    const name = decoder.decode(bytes.subarray(cursor + 46, cursor + 46 + nameLength));
    if (names.has(name)) throw new GitHubInfraError('artifact-invalid', `Artifact ZIP contains duplicate entry: ${name}`);
    names.add(name); if (name.startsWith('/') || name.includes('\\') || name.split('/').includes('..')) throw new GitHubInfraError('artifact-invalid', `Artifact ZIP contains unsafe path: ${name}`);
    const uncompressed = u32(view, cursor + 24); total += uncompressed; if (uncompressed > limits.maxEntryBytes || total > limits.maxUncompressedBytes) throw new GitHubInfraError('artifact-limit-exceeded', 'Artifact ZIP uncompressed size exceeds limits');
    const mode = u32(view, cursor + 38) >>> 16; if ((mode & 0o170000) === 0o120000) throw new GitHubInfraError('artifact-invalid', `Artifact ZIP contains symlink: ${name}`);
    result.push({ name, uncompressed }); cursor += 46 + nameLength + extraLength + commentLength;
  }
  return result;
}
