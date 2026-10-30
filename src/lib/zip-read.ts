/**
 * Typed façade over `scripts/zip-read.mjs`.
 *
 * The implementation lives in scripts/ rather than here because
 * `bin/seo-update-zip.mjs` has to unpack a downloaded release on a
 * user's machine, where there is no TypeScript and no build step. Two
 * zip parsers in one repository is exactly the kind of pair this
 * codebase keeps finding already-drifted, so there is one, and this
 * file is the typed view of it.
 */
export type ZipEntry = {
  /** Entry name exactly as stored — including a backslash, if some tool wrote one. */
  name: string;
  compressedSize: number;
  uncompressedSize: number;
  method: number;
  localHeaderOffset: number;
};

import {
  listZipEntries as listRaw,
  readZipEntry as readRaw,
} from "../../scripts/zip-read.mjs";

export function listZipEntries(buf: Buffer): ZipEntry[] {
  return listRaw(buf) as ZipEntry[];
}

export function readZipEntry(buf: Buffer, name: string): Buffer {
  return readRaw(buf, name) as Buffer;
}
