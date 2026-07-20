#!/usr/bin/env node

import {
  closeSync,
  constants,
  createReadStream,
  fstatSync,
  lstatSync,
  openSync,
  realpathSync,
} from "node:fs";
import { dirname, extname, isAbsolute, resolve } from "node:path";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";

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

const modulePath = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === modulePath) {
  if (process.argv.length !== 4) {
    console.error("FATAL: canonical SQL reader requires one file and one allowed directory");
    process.exitCode = 2;
  } else {
    try {
      await streamCanonicalSqlFile(process.argv[2], process.argv[3]);
    } catch {
      console.error("FATAL: canonical SQL reader rejected the input");
      process.exitCode = 1;
    }
  }
}
