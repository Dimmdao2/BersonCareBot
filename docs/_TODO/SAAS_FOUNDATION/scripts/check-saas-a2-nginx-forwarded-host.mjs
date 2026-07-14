#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const templatePath = "deploy/nginx/bersoncarebot-webapp.vhost.template.conf";
const roadmapPath = "docs/_TODO/SAAS_FOUNDATION/SAAS_ENFORCE_ROADMAP.md";
const smokeDocPath = "docs/_TODO/SAAS_FOUNDATION/SAAS_PRODUCT_SMOKE_A1.md";
const smokeContractPath = "docs/_TODO/SAAS_FOUNDATION/saas-product-smoke-contract.json";

function usage() {
  return [
    "Usage:",
    "  node docs/_TODO/SAAS_FOUNDATION/scripts/check-saas-a2-nginx-forwarded-host.mjs",
    "  node docs/_TODO/SAAS_FOUNDATION/scripts/check-saas-a2-nginx-forwarded-host.mjs --self-test",
    "  sudo nginx -T 2>/tmp/nginx.dump && node docs/_TODO/SAAS_FOUNDATION/scripts/check-saas-a2-nginx-forwarded-host.mjs --nginx-dump=/tmp/nginx.dump",
  ].join("\n");
}

function parseArgs(argv) {
  const options = { selfTest: false, nginxDump: null };
  for (const arg of argv) {
    if (arg === "--help" || arg === "-h") {
      console.log(usage());
      process.exit(0);
    }
    if (arg === "--self-test") {
      options.selfTest = true;
      continue;
    }
    if (arg.startsWith("--nginx-dump=")) {
      options.nginxDump = arg.slice("--nginx-dump=".length);
      continue;
    }
    throw new Error(`Unknown argument: ${arg}\n\n${usage()}`);
  }
  return options;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function read(path) {
  return readFileSync(resolve(path), "utf8");
}

function extractLocationSlash(configText) {
  const locationStart = configText.search(/location\s+\/\s*\{/);
  assert(locationStart >= 0, "missing effective `location /` block");

  const openBrace = configText.indexOf("{", locationStart);
  assert(openBrace >= 0, "malformed `location /` block");

  let depth = 0;
  for (let index = openBrace; index < configText.length; index += 1) {
    const char = configText[index];
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return configText.slice(openBrace + 1, index);
      }
    }
  }
  throw new Error("unterminated `location /` block");
}

function assertProxyHeader(block, headerName, expectedValue) {
  const escapedName = headerName.replaceAll("-", "\\-");
  const escapedValue = expectedValue.replaceAll("$", "\\$");
  const pattern = new RegExp(`proxy_set_header\\s+${escapedName}\\s+${escapedValue}\\s*;`, "i");
  assert(pattern.test(block), `missing proxy header: ${headerName} ${expectedValue}`);
}

function assertWebappProxyContract(configText, sourceName) {
  const block = extractLocationSlash(configText);
  assertProxyHeader(block, "Host", "$host");
  assertProxyHeader(block, "X-Forwarded-Host", "$host");
  assertProxyHeader(block, "X-Forwarded-Proto", "$scheme");
  assertProxyHeader(block, "X-Real-IP", "$remote_addr");
  assert(/proxy_pass\s+(__UPSTREAM__|http:\/\/127\.0\.0\.1:(6200|6300))\s*;/i.test(block), `${sourceName}: missing webapp loopback proxy_pass`);
}

function runChecks({ template, nginxDump }) {
  assertWebappProxyContract(template, templatePath);

  const roadmap = read(roadmapPath);
  assert(roadmap.includes("proxy_set_header X-Forwarded-Host"), "roadmap must keep A2 forwarded-host requirement");

  const smokeDoc = read(smokeDocPath);
  assert(smokeDoc.includes("smoke:saas-product"), "A1 smoke doc must include real smoke command");

  const smokeContract = JSON.parse(read(smokeContractPath));
  const mutationIds = new Set(smokeContract.mutationScenarios.map((scenario) => scenario.id));
  assert(mutationIds.has("server-action.forwarded-host.sentinel"), "smoke contract missing A2 Server Action sentinel slot");

  if (nginxDump) {
    assertWebappProxyContract(nginxDump, "--nginx-dump");
  }
}

function runSelfTest(template) {
  const broken = template.replace(/^\s*proxy_set_header X-Forwarded-Host \$host;\n/m, "");
  try {
    runChecks({ template: broken, nginxDump: null });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    assert(message.includes("X-Forwarded-Host"), `self-test failed for wrong reason: ${message}`);
    console.log("check-saas-a2-nginx-forwarded-host self-test: OK");
    return;
  }
  throw new Error("self-test did not detect missing X-Forwarded-Host");
}

try {
  const options = parseArgs(process.argv.slice(2));
  const template = read(templatePath);
  if (options.selfTest) {
    runSelfTest(template);
  } else {
    const nginxDump = options.nginxDump ? read(options.nginxDump) : null;
    runChecks({ template, nginxDump });
    console.log("check-saas-a2-nginx-forwarded-host: OK");
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`check-saas-a2-nginx-forwarded-host: ${message}`);
  process.exit(1);
}
