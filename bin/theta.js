#!/usr/bin/env node

/**
 * θ (theta) — A-Level STEM Learning Harness for pi
 * CLI entrypoint and global launcher.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, spawnSync, execSync } from "node:child_process";

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

function findPiRunner() {
  // 1. Check local/bundled node_modules
  try {
    const pkg = path.join(PACKAGE_ROOT, "node_modules", "@earendil-works", "pi-coding-agent", "package.json");
    if (fs.existsSync(pkg)) {
      const cli = path.join(PACKAGE_ROOT, "node_modules", "@earendil-works", "pi-coding-agent", "dist", "cli.js");
      if (fs.existsSync(cli)) return { type: "node", path: cli };
    }
  } catch {}

  // 2. Check npm global root
  try {
    const globalRoot = execSync("npm root -g", { encoding: "utf-8", stdio: ["pipe", "pipe", "ignore"] }).trim();
    const cli = path.join(globalRoot, "@earendil-works", "pi-coding-agent", "dist", "cli.js");
    if (fs.existsSync(cli)) return { type: "node", path: cli };
  } catch {}

  // 3. Check where/which in PATH
  try {
    const lookupCmd = process.platform === "win32" ? "where.exe pi" : "which pi";
    const stdout = execSync(lookupCmd, { encoding: "utf-8", stdio: ["pipe", "pipe", "ignore"] }).trim();
    if (stdout) {
      const firstLine = stdout.split(/\r?\n/)[0].trim();
      if (fs.existsSync(firstLine)) {
        return { type: "bin", path: firstLine };
      }
    }
  } catch {}

  // 4. If pi is not installed anywhere on the system, automatically install it for the user
  console.log("\x1b[36m%s\x1b[0m", "pi coding agent engine not found. Performing one-time installation...");
  try {
    execSync("npm install -g @earendil-works/pi-coding-agent", { stdio: "inherit" });
    console.log("\x1b[32m%s\x1b[0m", "✓ pi installed successfully!");

    // Re-check npm global root
    const globalRoot = execSync("npm root -g", { encoding: "utf-8", stdio: ["pipe", "pipe", "ignore"] }).trim();
    const cli = path.join(globalRoot, "@earendil-works", "pi-coding-agent", "dist", "cli.js");
    if (fs.existsSync(cli)) return { type: "node", path: cli };
  } catch (err) {
    console.warn("Could not auto-install pi. Please run manually: npm install -g @earendil-works/pi-coding-agent");
  }

  // 5. Default command
  return { type: "bin", path: process.platform === "win32" ? "pi.cmd" : "pi" };
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

function setupGlobal() {
  console.log("\x1b[36m%s\x1b[0m", "Setting up θ (theta) in global pi configuration...");
  const agentDir = getPiAgentDir();
  console.log(`Target global directory: ${agentDir}`);

  const targets = [
    { src: path.join(BUNDLED_PI_DIR, "skills"), dest: path.join(agentDir, "skills") },
    { src: path.join(BUNDLED_PI_DIR, "extensions"), dest: path.join(agentDir, "extensions") },
    { src: path.join(BUNDLED_PI_DIR, "agents"), dest: path.join(agentDir, "agents") },
  ];

  for (const { src, dest } of targets) {
    if (fs.existsSync(src)) {
      copyDirectoryRecursive(src, dest);
      console.log(`  ✓ Synced ${path.basename(src)} -> ${dest}`);
    }
  }

  console.log("\x1b[32m%s\x1b[0m", "✓ θ (theta) skills, extensions, and agents installed successfully!");
  console.log("You can now run either 'theta' or 'pi' in any directory to start learning.\n");
}

function runDoctor() {
  console.log("\x1b[1m\x1b[36m=== θ (theta) Doctor Diagnostic ===\x1b[0m\n");

  // 1. Node check
  const nodeVersion = process.version;
  console.log(`Node.js version: \x1b[32m${nodeVersion}\x1b[0m (Path: ${process.execPath})`);

  // 2. Pi runner check
  const runner = findPiRunner();
  console.log(`pi runner: \x1b[32m${runner.type === "node" ? "Direct Node CLI" : "Executable"}\x1b[0m (${runner.path})`);

  // 3. Theta assets check
  const skillsExist = fs.existsSync(path.join(BUNDLED_PI_DIR, "skills", "teach", "SKILL.md"));
  const quizExist = fs.existsSync(path.join(BUNDLED_PI_DIR, "extensions", "quiz.ts"));
  const mdLogExist = fs.existsSync(path.join(BUNDLED_PI_DIR, "extensions", "md-log.ts"));
  console.log(`Theta bundled assets:`);
  console.log(`  - teach skill: ${skillsExist ? "\x1b[32mOK\x1b[0m" : "\x1b[31mMISSING\x1b[0m"}`);
  console.log(`  - quiz extension: ${quizExist ? "\x1b[32mOK\x1b[0m" : "\x1b[31mMISSING\x1b[0m"}`);
  console.log(`  - md-log extension: ${mdLogExist ? "\x1b[32mOK\x1b[0m" : "\x1b[31mMISSING\x1b[0m"}`);

  // 4. Global ~/.pi/agent status
  const agentDir = getPiAgentDir();
  const globalTeach = fs.existsSync(path.join(agentDir, "skills", "teach", "SKILL.md"));
  console.log(`Global integration (~/.pi/agent):`);
  console.log(`  - Location: ${agentDir}`);
  console.log(`  - Installed globally: ${globalTeach ? "\x1b[32mYES\x1b[0m" : "\x1b[33mNO (run 'theta setup' to enable)\x1b[0m"}`);

  // 5. API keys
  const keys = [
    "OPENROUTER_API_KEY",
    "ANTHROPIC_API_KEY",
    "OPENAI_API_KEY",
    "GEMINI_API_KEY",
    "DEEPSEEK_API_KEY"
  ];
  const detectedKeys = keys.filter(k => !!process.env[k]);
  console.log(`Detected API keys: ${detectedKeys.length > 0 ? "\x1b[32m" + detectedKeys.join(", ") + "\x1b[0m" : "\x1b[33mNone in environment (relying on ~/.pi/agent/auth.json or models-store)\x1b[0m"}`);

  console.log("\n\x1b[32mAll systems verified. Ready to launch with 'theta'.\x1b[0m\n");
}

function printHelp() {
  console.log(`
\x1b[1m\x1b[36mθ (theta) — A-Level STEM Learning Harness for pi\x1b[0m

\x1b[1mUSAGE:\x1b[0m
  \x1b[32mtheta\x1b[0m [options] [prompt]
  \x1b[32mtheta\x1b[0m <subcommand>

\x1b[1mSUBCOMMANDS:\x1b[0m
  \x1b[33msetup\x1b[0m            Install/sync theta skills & extensions to global ~/.pi/agent/
  \x1b[33mdoctor\x1b[0m           Verify system requirements, pi runner, and asset status
  \x1b[33mhelp\x1b[0m, \x1b[33m--help\x1b[0m     Display this guide

\x1b[1mEXAMPLES:\x1b[0m
  # Start interactive learning session anywhere
  theta

  # Start with an immediate topic prompt
  theta "Teach me Year 2 Differentiation: Chain Rule from first principles"

  # Forward any custom flags to pi
  theta --model openrouter/anthropic/claude-3.5-sonnet

\x1b[1mOBSIDIAN MIRRORING:\x1b[0m
  Inside any theta session, type:
    \x1b[35m/md-log "C:\\path\\to\\your\\notes\\calculus.md"\x1b[0m
  to live-stream equations, derivations, and quiz feedback straight into Obsidian!
`);
}

function launchTheta(args) {
  const runner = findPiRunner();

  // Extensions and skills to load
  const extQuiz = path.join(BUNDLED_PI_DIR, "extensions", "quiz.ts");
  const extMdLog = path.join(BUNDLED_PI_DIR, "extensions", "md-log.ts");
  const extAsk = path.join(BUNDLED_PI_DIR, "extensions", "ask-user-question.ts");
  const extVisual = path.join(BUNDLED_PI_DIR, "extensions", "visual-tools", "index.ts");
  const skillTeach = path.join(BUNDLED_PI_DIR, "skills", "teach");
  const skillVisualize = path.join(BUNDLED_PI_DIR, "skills", "visualize");

  const piArgs = [];

  // Add extensions if present
  if (fs.existsSync(extQuiz)) piArgs.push("--extension", extQuiz);
  if (fs.existsSync(extMdLog)) piArgs.push("--extension", extMdLog);
  if (fs.existsSync(extAsk)) piArgs.push("--extension", extAsk);
  if (fs.existsSync(extVisual)) piArgs.push("--extension", extVisual);

  // Add skills if present
  if (fs.existsSync(skillTeach)) piArgs.push("--skill", skillTeach);
  if (fs.existsSync(skillVisualize)) piArgs.push("--skill", skillVisualize);

  // Pass remaining user arguments
  piArgs.push(...args);

  let child;
  if (runner.type === "node") {
    child = spawn(process.execPath, [runner.path, ...piArgs], {
      stdio: "inherit",
      cwd: process.cwd(),
      env: process.env,
    });
  } else {
    child = spawn(runner.path, piArgs, {
      stdio: "inherit",
      cwd: process.cwd(),
      env: process.env,
      shell: process.platform === "win32",
    });
  }

  child.on("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
    } else {
      process.exit(code ?? 0);
    }
  });
}

function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (command === "setup") {
    setupGlobal();
    return;
  }
  if (command === "doctor") {
    runDoctor();
    return;
  }
  if (command === "help" || command === "--help" || command === "-h") {
    printHelp();
    return;
  }

  // Auto-sync global ~/.pi/agent on first run if missing
  const agentDir = getPiAgentDir();
  const globalTeach = path.join(agentDir, "skills", "teach", "SKILL.md");
  if (!fs.existsSync(globalTeach)) {
    try {
      setupGlobal();
    } catch {}
  }

  launchTheta(args);
}

main();
