#!/usr/bin/env node

import {
  closeSync,
  constants,
  createReadStream,
  fstatSync,
  lstatSync,
  openSync,
  readFileSync,
  realpathSync,
} from "node:fs";
import { dirname, extname, isAbsolute, relative, resolve, sep } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";

const MAX_RELATIVE_INCLUDE_DEPTH = 16;
const MAX_EXPANDED_SQL_FILES = 64;
const MAX_EXPANDED_SQL_BYTES = 32 * 1024 * 1024;

function sameFile(left, right) {
  return left.dev === right.dev && left.ino === right.ino;
}

export function openCanonicalRegularFile(filePath, expectedPath) {
  if (
    typeof filePath !== "string" ||
    typeof expectedPath !== "string" ||
    !isAbsolute(filePath) ||
    !isAbsolute(expectedPath) ||
    filePath !== expectedPath ||
    realpathSync(dirname(expectedPath)) !== dirname(expectedPath)
  ) {
    throw new Error("canonical file path rejected");
  }

  const beforeOpen = lstatSync(filePath);
  if (beforeOpen.isSymbolicLink() || !beforeOpen.isFile()) {
    throw new Error("canonical input is not a regular file");
  }

  let descriptor;
  try {
    descriptor = openSync(
      filePath,
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
    );
    const opened = fstatSync(descriptor);
    const afterOpen = lstatSync(filePath);
    const canonicalPath = realpathSync(filePath);
    const afterCanonicalization = lstatSync(filePath);
    if (
      !opened.isFile() ||
      afterOpen.isSymbolicLink() ||
      !afterOpen.isFile() ||
      afterCanonicalization.isSymbolicLink() ||
      !afterCanonicalization.isFile() ||
      !sameFile(beforeOpen, opened) ||
      !sameFile(opened, afterOpen) ||
      !sameFile(opened, afterCanonicalization) ||
      canonicalPath !== expectedPath
    ) {
      throw new Error("canonical file changed while opening");
    }
    return descriptor;
  } catch (error) {
    if (descriptor !== undefined) closeSync(descriptor);
    throw error;
  }
}

export function openCanonicalSqlFile(sqlPath, allowedDirectory) {
  if (
    typeof sqlPath !== "string" ||
    typeof allowedDirectory !== "string" ||
    extname(sqlPath) !== ".sql" ||
    dirname(sqlPath) !== allowedDirectory ||
    realpathSync(allowedDirectory) !== allowedDirectory
  ) {
    throw new Error("canonical SQL path rejected");
  }
  return openCanonicalRegularFile(sqlPath, sqlPath);
}

function validateCanonicalIncludeRoot(includeRoot) {
  if (typeof includeRoot !== "string" || !isAbsolute(includeRoot)) {
    throw new Error("canonical SQL include root rejected");
  }
  const rootMetadata = lstatSync(includeRoot);
  if (
    rootMetadata.isSymbolicLink() ||
    !rootMetadata.isDirectory() ||
    realpathSync(includeRoot) !== includeRoot
  ) {
    throw new Error("canonical SQL include root rejected");
  }
}

function openCanonicalIncludedSqlFile(sqlPath, includeRoot) {
  if (typeof sqlPath !== "string") {
    throw new Error("canonical SQL include path rejected");
  }
  const relativePath = relative(includeRoot, sqlPath);
  if (
    extname(sqlPath) !== ".sql" ||
    relativePath === "" ||
    relativePath === ".." ||
    relativePath.startsWith(`..${sep}`) ||
    isAbsolute(relativePath)
  ) {
    throw new Error("canonical SQL include path rejected");
  }
  return openCanonicalRegularFile(sqlPath, sqlPath);
}

function expandPinnedSqlDescriptor(sqlPath, descriptor, includeRoot, state, activeFiles, depth) {
  if (depth > MAX_RELATIVE_INCLUDE_DEPTH) {
    throw new Error("canonical SQL include depth exceeded");
  }
  state.fileCount += 1;
  if (state.fileCount > MAX_EXPANDED_SQL_FILES) {
    throw new Error("canonical SQL include count exceeded");
  }

  const opened = fstatSync(descriptor);
  const fileIdentity = `${opened.dev}:${opened.ino}`;
  if (activeFiles.has(fileIdentity)) {
    throw new Error("canonical SQL include cycle rejected");
  }
  activeFiles.add(fileIdentity);

  try {
    const bytes = readFileSync(descriptor);
    state.byteCount += bytes.byteLength;
    if (state.byteCount > MAX_EXPANDED_SQL_BYTES) {
      throw new Error("canonical SQL expanded size exceeded");
    }
    const content = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    let expanded = "";

    for (const line of content.split(/(?<=\n)/u)) {
      const withoutNewline = line.endsWith("\n") ? line.slice(0, -1) : line;
      const directiveLine = withoutNewline.endsWith("\r")
        ? withoutNewline.slice(0, -1)
        : withoutNewline;
      if (!/^[\t ]*\\ir/u.test(directiveLine)) {
        expanded += line;
        continue;
      }

      const directive = directiveLine.match(/^[\t ]*\\ir[\t ]+([A-Za-z0-9._/-]+)[\t ]*$/u);
      if (!directive || isAbsolute(directive[1])) {
        throw new Error("malformed canonical SQL relative include");
      }
      const includedPath = resolve(dirname(sqlPath), directive[1]);
      const includedDescriptor = openCanonicalIncludedSqlFile(includedPath, includeRoot);
      try {
        const included = expandPinnedSqlDescriptor(
          includedPath,
          includedDescriptor,
          includeRoot,
          state,
          activeFiles,
          depth + 1,
        );
        expanded += included;
        if (line.endsWith("\n") && !included.endsWith("\n")) expanded += "\n";
      } finally {
        closeSync(includedDescriptor);
      }
    }
    return expanded;
  } finally {
    activeFiles.delete(fileIdentity);
  }
}

export function expandCanonicalSqlFile(sqlPath, allowedDirectory, includeRoot) {
  validateCanonicalIncludeRoot(includeRoot);
  if (typeof allowedDirectory !== "string") {
    throw new Error("canonical SQL primary directory rejected");
  }
  const allowedDirectoryRelativePath = relative(includeRoot, allowedDirectory);
  if (
    allowedDirectoryRelativePath === ".." ||
    allowedDirectoryRelativePath.startsWith(`..${sep}`) ||
    isAbsolute(allowedDirectoryRelativePath)
  ) {
    throw new Error("canonical SQL primary directory escapes include root");
  }
  const descriptor = openCanonicalSqlFile(sqlPath, allowedDirectory);
  try {
    return expandPinnedSqlDescriptor(
      sqlPath,
      descriptor,
      includeRoot,
      { fileCount: 0, byteCount: 0 },
      new Set(),
      0,
    );
  } finally {
    closeSync(descriptor);
  }
}

export async function streamCanonicalSqlFile(sqlPath, allowedDirectory, output = process.stdout) {
  let descriptor = openCanonicalSqlFile(sqlPath, allowedDirectory);
  try {
    const input = createReadStream(sqlPath, { fd: descriptor, autoClose: true });
    descriptor = undefined;
    await pipeline(input, output, { end: false });
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

export async function streamCanonicalSqlFileWithRelativeIncludes(
  sqlPath,
  allowedDirectory,
  includeRoot,
  output = process.stdout,
) {
  const expanded = expandCanonicalSqlFile(sqlPath, allowedDirectory, includeRoot);
  await pipeline(Readable.from([expanded]), output, { end: false });
}

const modulePath = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === modulePath) {
  const expandRelativeIncludes =
    process.argv.length === 6 && process.argv[4] === "--expand-relative-includes";
  if (process.argv.length !== 4 && !expandRelativeIncludes) {
    console.error(
      "FATAL: canonical SQL reader requires one file and one allowed directory, plus an optional guarded include root",
    );
    process.exitCode = 2;
  } else {
    try {
      if (expandRelativeIncludes) {
        await streamCanonicalSqlFileWithRelativeIncludes(
          process.argv[2],
          process.argv[3],
          process.argv[5],
        );
      } else {
        await streamCanonicalSqlFile(process.argv[2], process.argv[3]);
      }
    } catch {
      console.error("FATAL: canonical SQL reader rejected the input");
      process.exitCode = 1;
    }
  }
}
