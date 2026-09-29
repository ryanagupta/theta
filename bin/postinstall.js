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

import { execSync } from "node:child_process";

// 1. Ensure @earendil-works/pi-coding-agent is installed globally so 'pi' is always available
try {
  let hasPi = false;
  try {
    const checkCmd = process.platform === "win32" ? "where.exe pi" : "which pi";
    execSync(checkCmd, { stdio: "ignore" });
    hasPi = true;
  } catch {
    hasPi = false;
  }

  if (!hasPi) {
    console.log("No global 'pi' binary found. Automatically installing @earendil-works/pi-coding-agent...");
    execSync("npm install -g @earendil-works/pi-coding-agent", { stdio: "inherit" });
    console.log("✓ Global 'pi' installed successfully!");
  }
} catch (e) {
  // If npm install -g fails (e.g. permission issues), theta.js will fallback to bundled node_modules
}

// 2. Sync theta skills, extensions, and examiner agents into ~/.pi/agent/
try {
  const agentDir = getPiAgentDir();
  if (fs.existsSync(path.dirname(agentDir)) || fs.existsSync(agentDir)) {
    console.log("Integrating θ (theta) into global pi configuration (~/.pi/agent)...");

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
  console.log("Note: Run 'learn setup' to finish configuring global extensions.");
}
