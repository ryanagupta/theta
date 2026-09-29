#!/usr/bin/env node

/**
 * θ (theta) postinstall hook
 * Automatically integrates theta skills, extensions, and agents into ~/.pi/agent/
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PACKAGE_ROOT = path.resolve(__dirname, "..");
const BUNDLED_PI_DIR = path.join(PACKAGE_ROOT, ".pi");

function getPiAgentDir() {
  if (process.env.PI_CODING_AGENT_DIR) {
    return path.resolve(process.env.PI_CODING_AGENT_DIR);
  }
  return path.join(os.homedir(), ".pi", "agent");
}

function copyDirectoryRecursive(src, dest) {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirectoryRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

try {
  const agentDir = getPiAgentDir();
  const agentParent = path.dirname(agentDir);
  if (fs.existsSync(agentParent) || fs.existsSync(agentDir)) {
    const targets = [
      { src: path.join(BUNDLED_PI_DIR, "skills"), dest: path.join(agentDir, "skills") },
      { src: path.join(BUNDLED_PI_DIR, "extensions"), dest: path.join(agentDir, "extensions") },
      { src: path.join(BUNDLED_PI_DIR, "agents"), dest: path.join(agentDir, "agents") },
    ];

    for (const { src, dest } of targets) {
      if (fs.existsSync(src)) {
        copyDirectoryRecursive(src, dest);
      }
    }
    console.log("✓ θ (theta) ready system-wide! Run 'learn' anywhere to start learning.");
  }
} catch (err) {
  // Silent fallback so postinstall never interrupts npm install
}

process.exit(0);
