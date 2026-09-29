/**
 * md-log — A-Level STEM Live Session Mirror to Obsidian Markdown.
 *
 * Designed for deep A-Level STEM learning sessions with:
 * - Native LaTeX math ($...$ and $$...$$) rendering
 * - Rich Obsidian Callout boxes ([!abstract], [!question], [!success], [!danger], [!check], [!tip])
 * - Multi-tier badges (Tier 1 Foundational, Tier 2 Intermediate, Tier 3 Exam Question)
 * - Official Mark Scheme breakdown tables (M/A/B marks)
 * - Native Mermaid and SVG diagram embedding
 * - Full history backfill on linking
 * - Smart directory resolution (handles vault folders automatically)
 *
 * Commands:
 *   /md-log <filepath_or_vault_folder>  — Link markdown file in Obsidian and backfill session.
 *   /md-unlog                           — Stop logging.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import * as fs from "node:fs";
import * as path from "node:path";

const QA_TOOLS = new Set(["quiz", "ask_user_question"]);

function cleanMarkdownMath(text: string): string {
	if (!text) return "";
	return text.replace(/`([^`\n]+)`/g, (match, inner) => {
		const trimmed = inner.trim();
		// Single variables: `x`, `y`, `u`, `t`, `n`
		if (/^[xyzutnkvw]$/i.test(trimmed)) return "$" + trimmed + "$";
		// Trig, exp, and log functions
		if (/^(sin|cos|tan|sec|cosec|cot|arcsin|arccos|arctan|ln|exp|log)\b/i.test(trimmed)) {
			const latex = trimmed
				.replace(/\bcosec\b/g, "\\mathrm{cosec}")
				.replace(/\b(sin|cos|tan|sec|cot|arcsin|arccos|arctan|ln|exp)\b/g, "\\$1");
			return "$" + latex + "$";
		}
		// Derivatives: `dy/dx`, `dx/dy`, etc.
		if (/^(dy\/dx|dx\/dy|dV\/dt|dV\/dr|dr\/dt|du\/dx|dy\/du)$/i.test(trimmed)) {
			const parts = trimmed.split("/");
			return "$\\frac{" + parts[0] + "}{" + parts[1] + "}$";
		}
		if (/^(d\/dx|d\/dy|d\/dt)$/i.test(trimmed)) {
			return "$\\frac{" + trimmed.slice(0, 1) + "}{" + trimmed.slice(2) + "}$";
		}
		// Math expressions with exponents, superscripts, or equations
		if (/[\^²³⁴⁵⁶⁷⁸⁹ⁿ⁺⁻=×·±]|(\b(dy|dx|du|dt)\b)/.test(trimmed)) {
			if (/\.(md|ts|js|json|png|jpg|exe)\b|npm|git|npx|cd|ls|powershell/i.test(trimmed)) return match;
			return "$" + trimmed + "$";
		}
		return match;
	});
}

export default function mdLog(pi: ExtensionAPI) {
	let logFile: string | null = null;

	// Resolve any input path into a valid .md target file
	function resolveTargetFilePath(inputPath: string, cwd: string): string {
		let resolved = path.isAbsolute(inputPath) ? inputPath : path.resolve(cwd, inputPath);

		// Fix unescaped backslash collisions (e.g. Documents\mathsdifferentiation_y2.md -> Documents\maths\differentiation_y2.md)
		const parentDir = path.dirname(resolved);
		const baseName = path.basename(resolved);
		if (fs.existsSync(parentDir)) {
			try {
				const entries = fs.readdirSync(parentDir, { withFileTypes: true });
				for (const ent of entries) {
					if (ent.isDirectory() && baseName.startsWith(ent.name) && baseName.length > ent.name.length) {
						const subFile = baseName.slice(ent.name.length).replace(/^[\\/]+/, "");
						const candidate = path.join(parentDir, ent.name, subFile);
						if (fs.existsSync(candidate) || subFile.endsWith(".md")) {
							resolved = candidate;
							break;
						}
					}
				}
			} catch {}
		}

		// If user pointed to an existing directory (e.g. an Obsidian vault folder like Documents/maths)
		if (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()) {
			// Check if there is an existing differentiation_y2.md or session.md in the directory
			const files = fs.readdirSync(resolved);
			const mdFiles = files.filter(f => f.endsWith(".md"));
			if (mdFiles.length > 0) {
				// Prefer recently modified .md file if present
				const sorted = mdFiles.map(f => ({
					file: f,
					time: fs.statSync(path.join(resolved, f)).mtimeMs
				})).sort((a, b) => b.time - a.time);
				resolved = path.join(resolved, sorted[0].file);
			} else {
				resolved = path.join(resolved, "session.md");
			}
		} else if (!resolved.endsWith(".md")) {
			// If user typed e.g. /md-log notes/calculus, append .md
			resolved = resolved + ".md";
		}

		return resolved;
	}

	pi.on("session_start", async (_event, ctx) => {
		let lastLinkData: { file: string | null } | undefined;
		for (const entry of ctx.sessionManager.getEntries()) {
			if (entry.type === "custom" && entry.customType === "md-log") {
				lastLinkData = entry.data as { file: string | null } | undefined;
			}
		}
		if (lastLinkData?.file) {
			const resolved = resolveTargetFilePath(lastLinkData.file, ctx.cwd);
			logFile = resolved;
			const theme = ctx.ui.theme;
			ctx.ui.setStatus(
				"md-log",
				theme.fg("accent", "🗒 ") + theme.fg("dim", path.basename(logFile)),
			);
		}
	});

	let writeLock: Promise<void> = Promise.resolve();
	function withLock<T>(fn: () => T | Promise<T>): Promise<T> {
		const prev = writeLock;
		let release: () => void;
		writeLock = new Promise<void>((r) => {
			release = r;
		});
		return prev.then(fn).finally(() => release!());
	}

	function appendToFile(text: string): void {
		if (!logFile) return;
		try {
			const dir = path.dirname(logFile);
			if (!fs.existsSync(dir)) {
				fs.mkdirSync(dir, { recursive: true });
			}
			let prefix = "";
			if (fs.existsSync(logFile)) {
				const current = fs.readFileSync(logFile, "utf-8");
				if (current.trim().length > 0) prefix = "\n\n";
			}
			fs.appendFileSync(logFile, prefix + text + "\n", "utf-8");
		} catch (err) {
			// Fallback: log file error to stderr or ignore
		}
	}

	function callout(type: string, title: string, bodyLines: string[]): string {
		const lines = [`> [!${type}] ${title}`];
		for (const line of bodyLines) {
			lines.push(line.length === 0 ? ">" : `> ${line}`);
		}
		return lines.join("\n");
	}

	function userBlock(text: string): string {
		const cleaned = cleanMarkdownMath(text);
		return `> [!quote] YOU\n>\n> ${cleaned.split("\n").join("\n> ")}`;
	}

	function stripSkillBlocks(text: string): string {
		return text.replace(
			/<skill\b([^>]*)>[\s\S]*?<\/skill>/g,
			(_match, attrs: string) => {
				const name = /name="([^"]+)"/.exec(attrs)?.[1];
				return `> [!note] SKILL loaded: ${name ?? "(unknown)"}`;
			},
		);
	}

	function assistantBlock(text: string): string {
		const cleaned = cleanMarkdownMath(text);
		return `> [!abstract] A-LEVEL TUTOR\n>\n> ${cleaned.split("\n").join("\n> ")}`;
	}

	function optionsList(options: Array<{ label: string }>): string[] {
		return options.map((o, i) => `${i + 1}. ${cleanMarkdownMath(o.label)}`);
	}

	function questionCallout(
		label: string,
		question: string,
		context: string | undefined,
		options: Array<{ label: string }>,
		tier?: string,
		marks?: number,
	): string {
		let fullTitle = label;
		if (tier) fullTitle = `[${tier}] ${fullTitle}`;
		if (marks !== undefined) fullTitle += ` (${marks} ${marks === 1 ? "Mark" : "Marks"})`;

		const body: string[] = [];
		for (const line of cleanMarkdownMath(question).split("\n")) body.push(line);
		if (context) {
			body.push("");
			for (const line of cleanMarkdownMath(context).split("\n")) body.push(line);
		}
		if (options.length > 0) {
			body.push("");
			body.push(...optionsList(options));
		}
		return callout("question", fullTitle, body);
	}

	function answerCalloutQuiz(details: any): string {
		const status = details?.status;
		if (status === "side-question") {
			const body: string[] = [];
			if (details.question) {
				body.push(`**Problem paused:** ${cleanMarkdownMath(details.question)}`);
				body.push("");
			}
			if (details.studentQuestion) {
				body.push(`**Your Question:** ${cleanMarkdownMath(details.studentQuestion)}`);
				body.push("");
			}
			body.push("*(Tutor explaining concept from first principles — resumes upon `continue`)*");
			return callout("note", "💡 Side Note: Question Paused for Clarification", body);
		}
		if (status === "cancelled") {
			return callout("warning", "Question — Skipped", ["(user skipped)"]);
		}
		if (status === "unavailable") {
			return callout("warning", "Question — Unavailable", [details?.message || ""]);
		}

		// Handle Exam Mode (Tier 3 free-form working + mark scheme)
		if (details?.mode === "exam-working") {
			const tierStr = details.tier ? `[${details.tier}] ` : "";
			const marksStr = details.marks !== undefined ? `(${details.marks} Marks)` : "";
			const title = `A-Level Exam Solution & Mark Scheme Audit ${tierStr}${marksStr}`.trim();
			const body: string[] = [];

			if (details.freeText) {
				body.push("**Your Submitted Working:**");
				for (const line of String(details.freeText).split("\n")) {
					body.push(`\`\`\`text\n${line}\n\`\`\``);
				}
				body.push("");
			}

			if (details.markScheme && Array.isArray(details.markScheme) && details.markScheme.length > 0) {
				body.push("**Official Mark Scheme Breakdown:**");
				body.push("| Mark | Criterion | Examiner Guidance |");
				body.push("| :--- | :--- | :--- |");
				for (const pt of details.markScheme) {
					const note = pt.examinerNote ? pt.examinerNote.replace(/\|/g, "\\|") : "-";
					body.push(`| **${pt.type}${pt.marks}** | ${pt.criterion.replace(/\|/g, "\\|")} | ${note} |`);
				}
				body.push("");
			}

			if (details.explanation) {
				body.push("**Model Worked Solution & Key Advice:**");
				for (const line of String(details.explanation).split("\n")) {
					body.push(line);
				}
			}

			return callout("check", title, body);
		}

		// Handle MCQ Mode
		const dontKnow = details?.dontKnow === true;
		const correct = details?.correct === true;
		const type = dontKnow ? "warning" : correct ? "success" : "danger";
		const badge = details?.tier ? `[${details.tier}] ` : "";
		const title = dontKnow
			? `${badge}Quiz — Knowledge Gap Flagged (I don't know)`
			: correct
				? `${badge}Quiz — Correct ✓`
				: `${badge}Quiz — Incorrect ✗ (Misconception Analysis)`;
		const body: string[] = [];

		if (dontKnow) {
			body.push("**Your Answer:** I don't know");
		} else {
			const answers: any[] = details?.answers || [];
			const sel = answers.map((a) => `${a.index}. ${a.label}`).join(", ") || "(none)";
			body.push(`**Your Answer:** ${sel}`);
		}

		const correctIndices: number[] = details?.correctIndices || [];
		if (correctIndices.length > 0) {
			const correctStr = correctIndices.map((i) => `${i}`).join(", ");
			body.push(`**Correct Option:** ${correctStr}`);
		}

		if (details?.note) {
			body.push("");
			body.push(`**Student Note:** ${cleanMarkdownMath(details.note)}`);
		}

		if (details?.explanation) {
			body.push("");
			body.push("**Explanation & Examiner Insights:**");
			for (const line of String(details.explanation).split("\n")) {
				body.push(cleanMarkdownMath(line));
			}
		}
		return callout(type, title, body);
	}

	function answerCalloutAsk(details: any): string {
		const status = details?.status;
		if (status === "cancelled") {
			return callout("warning", "Question — Skipped", ["(user skipped)"]);
		}
		if (status === "unavailable") {
			return callout("warning", "Question — Unavailable", [details?.message || ""]);
		}
		const answers: any[] = details?.answers || [];
		const body: string[] = answers.map((a) => {
			if (a.type === "other") return `Other: ${a.label}`;
			if (a.type === "text") return a.label;
			return `${a.index}. ${a.label}`;
		});
		if (body.length === 0) body.push("(no answer)");
		return callout("example", "Your Response", body);
	}

	// --- Backfill Active Conversation History ---

	function backfill(ctx: any): number {
		if (!logFile) return 0;
		const entries: any[] = ctx.sessionManager.getEntries();
		if (entries.length === 0) return 0;

		const byId = new Map<string, any>();
		for (const e of entries) if (e.id) byId.set(e.id, e);

		// Active leaf = last entry that has an id
		let leaf: any = null;
		for (let i = entries.length - 1; i >= 0; i--) {
			if (entries[i].id) {
				leaf = entries[i];
				break;
			}
		}
		if (!leaf) return 0;

		// Walk parent chain from leaf to root
		const chain: any[] = [];
		let cur: any = leaf;
		const seen = new Set<string>();
		while (cur && cur.id && !seen.has(cur.id)) {
			seen.add(cur.id);
			chain.push(cur);
			cur = cur.parentId ? byId.get(cur.parentId) : null;
		}
		chain.reverse();

		const toolCallArgs = new Map<string, { name: string; args: any }>();
		const blocks: string[] = [];
		let count = 0;

		for (const entry of chain) {
			if (entry.type !== "message") continue;
			const msg = entry.message;
			if (!msg || !("role" in msg)) continue;
			count++;

			if (msg.role === "user") {
				const text = typeof msg.content === "string"
					? msg.content
					: Array.isArray(msg.content)
						? msg.content.filter((c: any) => c.type === "text").map((c: any) => c.text).join("\n")
						: "";
				const trimmed = stripSkillBlocks(text.trim());
				if (trimmed) blocks.push(userBlock(trimmed));
				continue;
			}

			if (msg.role === "assistant") {
				for (const c of msg.content || []) {
					if (c.type === "toolCall" && QA_TOOLS.has(c.name)) {
						toolCallArgs.set(c.id, { name: c.name, args: c.arguments });
					}
				}
				const textParts = (msg.content || [])
					.filter((c: any) => c.type === "text")
					.map((c: any) => (c.text as string).trim())
					.filter((t: string) => t.length > 0);
				if (textParts.length > 0) {
					blocks.push(assistantBlock(textParts.join("\n\n")));
				}
				continue;
			}

			if (msg.role === "toolResult") {
				if (!QA_TOOLS.has(msg.toolName)) continue;
				const tc = toolCallArgs.get(msg.toolCallId);
				if (tc) {
					const a = tc.args || {};
					const label = tc.name === "quiz" ? "Quiz" : "Question";
					const shuffled = msg.toolName === "quiz"
						? (msg.details?.options as Array<{ index: number; label: string }> | undefined)
						: undefined;
					const options = shuffled && shuffled.length > 0
						? shuffled.map((o) => ({ label: o.label }))
						: (Array.isArray(a.options) ? a.options : []);
					blocks.push(questionCallout(label, a.question || "", a.details?.trim() || undefined, options, a.tier, a.marks));
				}
				if (msg.toolName === "quiz") {
					blocks.push(answerCalloutQuiz(msg.details));
				} else {
					blocks.push(answerCalloutAsk(msg.details));
				}
				continue;
			}
		}

		if (blocks.length > 0) {
			try {
				const dir = path.dirname(logFile);
				if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
				fs.writeFileSync(logFile, blocks.join("\n\n") + "\n", "utf-8");
			} catch (e) {
				// ignore
			}
		}
		return count;
	}

	// --- Real-Time Live Streaming & Event handlers ---
	let preMessageFileContent: string | null = null;
	let streamingTimer: NodeJS.Timeout | null = null;
	let lastStreamingText = "";

	pi.on("message_start", async (event, _ctx) => {
		if (!logFile) return;
		const msg = event.message;
		if (msg.role === "assistant") {
			try {
				preMessageFileContent = fs.existsSync(logFile) ? fs.readFileSync(logFile, "utf-8") : "";
			} catch {
				preMessageFileContent = "";
			}
			lastStreamingText = "";
		}
	});

	pi.on("message_update", async (event, _ctx) => {
		if (!logFile) return;
		const msg = event.message;
		if (msg.role !== "assistant") return;
		const textParts = (msg.content || [])
			.filter((c: any) => c.type === "text")
			.map((c: any) => c.text as string);
		const currentText = textParts.join("\n\n").trim();
		if (!currentText || currentText === lastStreamingText) return;
		lastStreamingText = currentText;

		if (!streamingTimer) {
			streamingTimer = setTimeout(() => {
				streamingTimer = null;
				if (!logFile || !lastStreamingText || preMessageFileContent === null) return;
				const block = assistantBlock(lastStreamingText);
				const fullContent = preMessageFileContent.length > 0
					? `${preMessageFileContent.trimEnd()}\n\n${block}\n`
					: `${block}\n`;
				try {
					fs.writeFileSync(logFile, fullContent, "utf-8");
				} catch {}
			}, 350);
		}
	});

	pi.on("message_end", async (event, _ctx) => {
		if (!logFile) return;
		const msg = event.message;
		if (!msg || !("role" in msg)) return;

		if (msg.role === "user") {
			const text = typeof msg.content === "string"
				? msg.content
				: Array.isArray(msg.content)
					? msg.content.filter((c: any) => c.type === "text").map((c: any) => c.text).join("\n")
					: "";
			const trimmed = stripSkillBlocks(text.trim());
			if (!trimmed) return;

			if (trimmed.includes("[SIDE NOTE / CONCEPT CLARIFICATION REQUEST]")) {
				const match = trimmed.match(/"([^"]+)"/);
				const sideQ = match ? match[1] : trimmed;
				const block = callout("note", "💡 Side Clarification Requested", [
					`**Your Question:** ${cleanMarkdownMath(sideQ)}`,
				]);
				await withLock(() => appendToFile(block));
				return;
			}

			if (trimmed.includes("[RESUME MAIN LESSON]")) {
				const block = callout("tip", "🔄 Resuming Main Lesson", [
					"Clarification complete — continuing lesson.",
				]);
				await withLock(() => appendToFile(block));
				return;
			}

			await withLock(() => appendToFile(userBlock(trimmed)));
			return;
		}

		if (msg.role === "assistant") {
			if (streamingTimer) {
				clearTimeout(streamingTimer);
				streamingTimer = null;
			}
			const textParts = (msg.content || [])
				.filter((c: any) => c.type === "text")
				.map((c: any) => (c.text as string).trim())
				.filter((t: string) => t.length > 0);
			if (textParts.length === 0) {
				preMessageFileContent = null;
				lastStreamingText = "";
				return;
			}
			const block = assistantBlock(textParts.join("\n\n"));
			if (preMessageFileContent !== null) {
				const fullContent = preMessageFileContent.length > 0
					? `${preMessageFileContent.trimEnd()}\n\n${block}\n`
					: `${block}\n`;
				await withLock(async () => {
					fs.writeFileSync(logFile!, fullContent, "utf-8");
				});
				preMessageFileContent = null;
				lastStreamingText = "";
			} else {
				await withLock(() => appendToFile(block));
			}
			return;
		}
	});

	pi.on("tool_call", async (event, _ctx) => {
		if (!logFile) return;
		const toolName = (event as any).toolName;
		if (toolName !== "ask_user_question") return;
		const input = (event as any).input || {};
		const question: string = input.question || "";
		const context: string | undefined = input.details?.trim() || undefined;
		const options: Array<{ label: string }> = Array.isArray(input.options) ? input.options : [];
		const block = questionCallout("Question", question, context, options);
		await withLock(() => appendToFile(block));
	});

	const loggedQuizQuestion = new Set<string>();

	function logQuizQuestion(toolCallId: string, input: any, shuffled?: Array<{ index: number; label: string }>) {
		if (!logFile || loggedQuizQuestion.has(toolCallId)) return;
		loggedQuizQuestion.add(toolCallId);
		const question: string = input.question || "";
		const context: string | undefined = input.details?.trim() || undefined;
		const tier: string | undefined = input.tier?.trim() || undefined;
		const marks: number | undefined = input.marks;
		const options = shuffled && shuffled.length > 0
			? shuffled.map((o) => ({ label: o.label }))
			: (Array.isArray(input.options) ? input.options : []);
		const block = questionCallout("Question", question, context, options, tier, marks);
		withLock(() => appendToFile(block));
	}

	pi.on("tool_execution_start", async (event, _ctx) => {
		const toolName = (event as any).toolName;
		if (toolName !== "quiz") return;
		logQuizQuestion((event as any).toolCallId, (event as any).args || {});
	});

	pi.on("tool_execution_update", async (event, _ctx) => {
		const toolName = (event as any).toolName;
		if (toolName !== "quiz") return;
		const shuffled = (event as any).partialResult?.details?.options as Array<{ index: number; label: string }> | undefined;
		logQuizQuestion((event as any).toolCallId, (event as any).args || {}, shuffled);
	});

	pi.on("tool_result", async (event, _ctx) => {
		if (!logFile) return;
		const toolName = (event as any).toolName;
		if (!QA_TOOLS.has(toolName)) return;
		const details = (event as any).details;
		const block = toolName === "quiz"
			? answerCalloutQuiz(details)
			: answerCalloutAsk(details);
		await withLock(() => appendToFile(block));
	});

	// --- Commands ---

	pi.registerCommand("md-log", {
		description: "Mirror the session to an Obsidian markdown file (backfills history)",
		handler: async (args, ctx: any) => {
			const filepath = args.trim();
			if (!filepath) {
				ctx.ui.notify("Usage: /md-log <filepath_or_folder>", "warning");
				return;
			}
			if (typeof ctx.isIdle === "function" && !ctx.isIdle()) {
				ctx.ui.notify("Wait for the agent to finish before linking.", "warning");
				return;
			}

			const resolved = resolveTargetFilePath(filepath, ctx.cwd);

			logFile = resolved;
			pi.appendEntry("md-log", { file: resolved });

			// Immediately backfill all past conversation into the target file!
			const backfilledCount = backfill(ctx);

			const theme = ctx.ui.theme;
			ctx.ui.setStatus(
				"md-log",
				theme.fg("accent", "🗒 ") + theme.fg("dim", path.basename(resolved)),
			);
			ctx.ui.notify(`Linked session to: ${resolved} (${backfilledCount} entries backfilled)`, "success");
		},
	});

	pi.registerCommand("md-unlog", {
		description: "Stop mirroring session to markdown",
		handler: async (_args, ctx) => {
			if (!logFile) {
				ctx.ui.notify("No file currently linked", "warning");
				return;
			}
			const name = path.basename(logFile);
			logFile = null;
			pi.appendEntry("md-log", { file: null });
			ctx.ui.setStatus("md-log", undefined);
			ctx.ui.notify(`Unlinked: ${name}`, "info");
		},
	});
}
