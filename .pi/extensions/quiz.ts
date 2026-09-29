import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import {
	Editor,
	type EditorTheme,
	Key,
	Text,
	matchesKey,
	truncateToWidth,
	wrapTextWithAnsi,
} from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";

// ────────────────────────────────────────────────────────────────────────────
// quiz — A-Level STEM Graded Assessment & Official Mark Scheme Engine
//
// Supports two modes:
// 1. Diagnostic / Concept Check Mode (MCQ / Multi-select):
//    Presents diagnostic distractors, random shuffle, and an "I don't know"
//    option to catch honest knowledge gaps. Instant ✓/✗ feedback.
// 2. A-Level Exam Mode (Free-form working + Official Mark Scheme):
//    Presents authentic multi-step exam questions (Tier 3), captures student
//    working and final numerical/algebraic answers, then reveals the official
//    M/A/B mark scheme breakdown (Method, Accuracy, Independent marks) with
//    examiner tips and common pitfalls.
// ────────────────────────────────────────────────────────────────────────────

interface QuizOption {
	label: string;
	value: string;
	description?: string;
}

interface DisplayOption extends QuizOption {
	id: string;
	index: number;
	isSubmit?: boolean;
}

interface OptionAnswer {
	label: string;
	value: string;
	index: number;
}

interface MarkSchemePoint {
	type: string; // M, A, or B
	marks: number;
	criterion: string;
	examinerNote?: string;
}

const DONT_KNOW_VALUE = "__dont_know__";
const DONT_KNOW_LABEL = "I don't know";
const DONT_KNOW_INDEX = 0;

interface QuizResponse {
	dontKnow: boolean;
	sideQuestion?: boolean;
	sideQuestionText?: string;
	note?: string;
	answers: OptionAnswer[];
	freeText?: string;
}

type QuizStatus = "answered" | "cancelled" | "unavailable" | "side-question";
type QuizMode = "single-select" | "multi-select" | "exam-working";

interface DisplayedOption {
	index: number;
	label: string;
}

interface QuizResultDetails {
	status: QuizStatus;
	question: string;
	tier?: string;
	marks?: number;
	context?: string;
	mode: QuizMode;
	answers: OptionAnswer[];
	correctIndices: number[];
	options?: DisplayedOption[];
	correct?: boolean;
	dontKnow?: boolean;
	studentQuestion?: string;
	note?: string;
	freeText?: string;
	markScheme?: MarkSchemePoint[];
	explanation?: string;
	message?: string;
}

const OptionSchema = Type.Object({
	label: Type.String({ description: "Display label for the answer option." }),
	value: Type.Optional(
		Type.String({ description: "Optional machine-readable value returned for the option. Defaults to the label." }),
	),
	description: Type.Optional(Type.String({ description: "Optional extra detail shown below the option." })),
});

const MarkSchemeSchema = Type.Object({
	type: Type.String({ description: "Mark type: 'M' (Method), 'A' (Accuracy), or 'B' (Independent)." }),
	marks: Type.Number({ description: "Number of marks for this step (typically 1)." }),
	criterion: Type.String({ description: "Exact criteria or formula required for the mark." }),
	examinerNote: Type.Optional(Type.String({ description: "Examiner report tip, acceptable equivalent, or common trap." })),
});

const QuizParams = Type.Object({
	question: Type.String({
		description: "The single question to ask. For Tier 3 exam questions, state the full problem.",
	}),
	tier: Type.Optional(
		Type.String({
			description:
				"Progression tier: 'Tier 1: Foundational Practice', 'Tier 2: Intermediate Problem', 'Tier 3: A-Level Exam Question', or 'Active Recall'.",
		}),
	),
	marks: Type.Optional(
		Type.Number({
			description: "Total marks allocated for this question according to exam specification (e.g. 1, 4, 6, 8).",
		}),
	),
	details: Type.Optional(
		Type.String({ description: "Optional context, figures, given parameters, or boundary conditions." }),
	),
	options: Type.Optional(
		Type.Array(OptionSchema, {
			description:
				"MCQ options (2 or more). If omitted or examMode is true, free-form exam working mode is triggered.",
		}),
	),
	multiSelect: Type.Optional(
		Type.Boolean({ description: "True if more than one option is correct and must all be selected." }),
	),
	correctAnswer: Type.Optional(
		Type.Union([Type.String(), Type.Array(Type.String())], {
			description:
				"Required for MCQ mode. The correct option value(s). For exam mode, provide the final answer.",
		}),
	),
	markScheme: Type.Optional(
		Type.Array(MarkSchemeSchema, {
			description:
				"Structured official mark scheme points (M1, A1, B1 marks) detailing where method and accuracy marks are awarded.",
		}),
	),
	examMode: Type.Optional(
		Type.Boolean({
			description:
				"Set to true for authentic multi-step exam questions where the student submits working/final answer and audits against the mark scheme.",
		}),
	),
	explanation: Type.String({
		description:
			"REQUIRED. Complete worked solution, mathematical derivation, and examiner advice revealed after the student responds.",
	}),
	shuffle: Type.Optional(
		Type.Boolean({
			description: "Shuffle MCQ options before display (defaults to true).",
		}),
	),
});

function normalizeOptions(
	options: Array<{ label: string; value?: string; description?: string }> | undefined,
): QuizOption[] {
	const seen = new Set<string>();
	return (options || [])
		.map((option) => ({
			label: option.label.trim(),
			value: option.value?.trim() || option.label.trim(),
			description: option.description?.trim() || undefined,
		}))
		.filter((option) => {
			if (option.label.length === 0) return false;
			if (seen.has(option.value)) throw new Error(`duplicate option value "${option.value}"`);
			seen.add(option.value);
			return true;
		});
}

function shuffleOptions(options: QuizOption[]): QuizOption[] {
	const out = [...options];
	for (let i = out.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[out[i], out[j]] = [out[j], out[i]];
	}
	return out;
}

function coerceCorrectAnswer(correctAnswer: string | string[]): string[] {
	if (Array.isArray(correctAnswer)) return correctAnswer;
	const trimmed = correctAnswer.trim();
	if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
		try {
			const parsed = JSON.parse(trimmed);
			if (Array.isArray(parsed)) return parsed.map((v) => String(v));
		} catch {
			// fallback
		}
	}
	return [correctAnswer];
}

function resolveCorrect(
	correctAnswer: string | string[] | undefined,
	options: QuizOption[],
): { indices: number[]; error?: string } {
	if (correctAnswer === undefined) return { indices: [] };
	const arr = coerceCorrectAnswer(correctAnswer);
	if (arr.length === 0) return { indices: [] };
	const byValue = new Map(options.map((o, i) => [o.value, i + 1]));
	const indices: number[] = [];
	for (const raw of arr) {
		const v = typeof raw === "string" ? raw.trim() : raw;
		const idx = byValue.get(v);
		if (idx === undefined) {
			const known = options.map((o) => `"${o.value}"`).join(", ");
			return { indices: [], error: `correctAnswer "${v}" does not match any option value (${known})` };
		}
		indices.push(idx);
	}
	return { indices: Array.from(new Set(indices)).sort((a, b) => a - b) };
}

function createEditorTheme(theme: any): EditorTheme {
	return {
		borderColor: (s) => theme.fg("accent", s),
		selectList: {
			selectedPrefix: (t) => theme.fg("accent", t),
			selectedText: (t) => theme.fg("accent", t),
			description: (t) => theme.fg("muted", t),
			scrollInfo: (t) => theme.fg("dim", t),
			noMatch: (t) => theme.fg("warning", t),
		},
	};
}

function addWrapped(lines: string[], text: string, width: number, indent = ""): void {
	const contentWidth = Math.max(1, width - indent.length);
	for (const line of wrapTextWithAnsi(text, contentWidth)) {
		lines.push(truncateToWidth(`${indent}${line}`, width));
	}
}

function isCorrect(selectedIndices: number[], correctIndices: number[]): boolean {
	if (selectedIndices.length !== correctIndices.length) return false;
	const a = [...selectedIndices].sort((x, y) => x - y);
	const b = [...correctIndices].sort((x, y) => x - y);
	return a.every((v, i) => v === b[i]);
}

function cleanCliMath(text: string): string {
	if (!text) return "";
	return text
		// Convert superscripts
		.replace(/\^2/g, "²")
		.replace(/\^3/g, "³")
		.replace(/\^4/g, "⁴")
		.replace(/\^5/g, "⁵")
		.replace(/\^6/g, "⁶")
		.replace(/\^7/g, "⁷")
		.replace(/\^8/g, "⁸")
		.replace(/\^9/g, "⁹")
		.replace(/\^0/g, "⁰")
		.replace(/\^n/g, "ⁿ")
		.replace(/\^x/g, "ˣ")
		.replace(/\^t/g, "ᵗ")
		.replace(/\^-1/g, "⁻¹")
		.replace(/\^\{([0-9]+)\}/g, (_m, p1) => {
			const map: Record<string, string> = { "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹" };
			return p1.split("").map((c: string) => map[c] || c).join("");
		})
		// Common STEM symbols
		.replace(/\\times/g, "×")
		.replace(/\\cdot/g, "·")
		.replace(/\\approx/g, "≈")
		.replace(/\\neq/g, "≠")
		.replace(/\\leq/g, "≤")
		.replace(/\\geq/g, "≥")
		.replace(/\\pm/g, "±")
		.replace(/\\pi/g, "π")
		.replace(/\\theta/g, "θ")
		.replace(/\\alpha/g, "α")
		.replace(/\\beta/g, "β")
		.replace(/\\omega/g, "ω")
		.replace(/\\sqrt\{([^}]+)\}/g, "√($1)")
		.replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, "($1)/($2)")
		// Strip raw LaTeX delimiters $...$ or $$...$$
		.replace(/\$\$([^$]+)\$\$/g, "$1")
		.replace(/\$([^$]+)\$/g, "$1");
}

function pushHeader(
	lines: string[],
	theme: any,
	width: number,
	question: string,
	context: string | undefined,
	tier?: string,
	marks?: number,
): void {
	lines.push(truncateToWidth(theme.fg("accent", "─".repeat(width)), width));
	let badge = "";
	if (tier) badge += `[${tier}] `;
	if (marks !== undefined) badge += `[${marks} ${marks === 1 ? "Mark" : "Marks"}]`;
	if (badge) {
		lines.push(truncateToWidth(` ${theme.bold(theme.fg("accent", badge))}`, width));
		lines.push("");
	}
	addWrapped(lines, theme.fg("text", cleanCliMath(question)), width, " ");
	if (context) {
		lines.push("");
		addWrapped(lines, theme.fg("muted", cleanCliMath(context)), width, " ");
	}
}

function pushDontKnowRow(lines: string[], theme: any, width: number, focused: boolean): void {
	lines.push("");
	const prefix = focused ? theme.fg("accent", "> ") : "  ";
	const styled = focused ? theme.fg("accent", DONT_KNOW_LABEL) : theme.fg("dim", DONT_KNOW_LABEL);
	lines.push(truncateToWidth(`${prefix}${styled}`, width));
}

function pushSideQuestionRow(lines: string[], theme: any, width: number, focused: boolean): void {
	lines.push("");
	const label = "💡 [?] Ask a side question / clarification (/side)";
	const prefix = focused ? theme.fg("accent", "> ") : "  ";
	const styled = focused ? theme.fg("accent", label) : theme.fg("dim", label);
	lines.push(truncateToWidth(`${prefix}${styled}`, width));
}

function pushSideQuestionEditor(lines: string[], theme: any, width: number, editor: Editor): void {
	lines.push("");
	const label = theme.fg("accent", "💡 Your question (e.g. where did -1 come from in that equation?):");
	addWrapped(lines, label, width, " ");
	for (const line of editor.render(width)) lines.push(line);
}

function pushNoteField(lines: string[], theme: any, width: number, editor: Editor, focused: boolean): void {
	lines.push("");
	const label = focused ? theme.fg("accent", "Note (optional):") : theme.fg("muted", "Note (optional):");
	addWrapped(lines, label, width, " ");
	for (const line of editor.render(width)) lines.push(line);
}

function makeNoteEditor(tui: any, theme: any): Editor {
	const editor = new Editor(tui, createEditorTheme(theme));
	editor.focused = false;
	editor.disableSubmit = true;
	return editor;
}

function formatOptionRef(options: QuizOption[], index: number): string {
	const opt = options.find((o, i) => i + 1 === index);
	return `${index}. ${opt ? cleanCliMath(opt.label) : "(unknown)"}`;
}

// ────────────────────────────────────────────────────────────────────────────
// Free-form A-Level Exam Mode Component
// ────────────────────────────────────────────────────────────────────────────

async function askExamWorking(
	ctx: any,
	question: string,
	context: string | undefined,
	tier: string | undefined,
	marks: number | undefined,
	markScheme: MarkSchemePoint[] | undefined,
	explanation: string,
): Promise<QuizResponse | null> {
	return ctx.ui.custom<QuizResponse | null>(
		(tui: any, theme: any, _kb: any, done: (result: QuizResponse | null) => void) => {
			let phase: "working" | "markScheme" = "working";
			const workingEditor = new Editor(tui, createEditorTheme(theme));
			workingEditor.focused = true;
			let userSubmittedWorking = "";
			let cachedLines: string[] | undefined;
			let cachedWidth = -1;

			function refresh() {
				cachedLines = undefined;
				tui.requestRender();
			}

			function handleInput(data: string) {
				if (phase === "markScheme") {
					if (matchesKey(data, Key.enter) || matchesKey(data, Key.escape)) {
						done({
							dontKnow: false,
							freeText: userSubmittedWorking,
							answers: [],
						});
					}
					return;
				}

				if (matchesKey(data, Key.escape)) {
					done(null);
					return;
				}

				if (matchesKey(data, Key.enter)) {
					userSubmittedWorking = workingEditor.getText().trim();
					if (userSubmittedWorking.startsWith("/side") || userSubmittedWorking.startsWith("/sidenote") || userSubmittedWorking.startsWith("?")) {
						const cleaned = userSubmittedWorking.replace(/^(\/sidenote|\/side|\?)\s*/, "").trim();
						done({
							dontKnow: false,
							sideQuestion: true,
							sideQuestionText: cleaned || "Where did that term/step come from in the problem?",
							answers: [],
						});
						return;
					}
					phase = "markScheme";
					refresh();
					return;
				}

				workingEditor.handleInput(data);
				refresh();
			}

			function render(width: number): string[] {
				if (cachedLines && cachedWidth === width) return cachedLines;
				const lines: string[] = [];
				const add = (text: string) => lines.push(truncateToWidth(text, width));

				pushHeader(lines, theme, width, question, context, tier, marks);

				if (phase === "working") {
					lines.push("");
					add(theme.fg("accent", " Your Answer / Key Working Steps:"));
					for (const line of workingEditor.render(width)) lines.push(line);
					lines.push("");
					add(theme.fg("dim", " Type answer • /side <question> to pause for clarification • Enter submit • Esc cancel"));
					add(theme.fg("accent", "─".repeat(width)));
					cachedLines = lines;
					cachedWidth = width;
					return lines;
				}

				// Phase: Official Mark Scheme Breakdown
				lines.push("");
				add(theme.fg("accent", theme.bold(" ════ OFFICIAL A-LEVEL MARK SCHEME AUDIT ════")));
				lines.push("");
				if (userSubmittedWorking) {
					add(theme.fg("muted", " Your Working:"));
					addWrapped(lines, theme.fg("text", userSubmittedWorking), width, "   ");
					lines.push("");
				}

				if (markScheme && markScheme.length > 0) {
					add(theme.fg("accent", " Mark Scheme Breakdown:"));
					for (const pt of markScheme) {
						const tag = theme.bold(theme.fg("success", `[${pt.type}${pt.marks}]`));
						add(`  ${tag} ${theme.fg("text", pt.criterion)}`);
						if (pt.examinerNote) {
							add(theme.fg("dim", `      Examiner Note: ${pt.examinerNote}`));
						}
					}
					lines.push("");
				}

				if (explanation) {
					add(theme.fg("accent", " Model Solution & Examiner Commentary:"));
					addWrapped(lines, theme.fg("text", explanation), width, "   ");
					lines.push("");
				}

				add(theme.fg("dim", " Enter / Esc to complete"));
				add(theme.fg("accent", "─".repeat(width)));
				cachedLines = lines;
				cachedWidth = width;
				return lines;
			}

			return {
				render,
				invalidate: () => {
					cachedLines = undefined;
					workingEditor.invalidate();
				},
				handleInput,
			};
		},
	);
}

// ────────────────────────────────────────────────────────────────────────────
// Single Choice & Multi Choice Components
// ────────────────────────────────────────────────────────────────────────────

async function askSingleChoice(
	ctx: any,
	question: string,
	context: string | undefined,
	tier: string | undefined,
	marks: number | undefined,
	options: QuizOption[],
	correctIndices: number[],
	explanation: string | undefined,
): Promise<QuizResponse | null> {
	const allOptions: DisplayOption[] = options.map((option, index) => ({
		...option,
		id: `option:${index}`,
		index: index + 1,
	}));
	const sideNav = allOptions.length;
	const dontKnowNav = allOptions.length + 1;

	return ctx.ui.custom<QuizResponse | null>(
		(tui: any, theme: any, _kb: any, done: (result: QuizResponse | null) => void) => {
			let optionIndex = 0;
			let phase: "select" | "feedback" = "select";
			let focus: "options" | "note" | "side" = "options";
			let chosen: OptionAnswer | null = null;
			let dontKnow = false;
			const editor = makeNoteEditor(tui, theme);
			const sideEditor = makeNoteEditor(tui, theme);
			let cachedLines: string[] | undefined;
			let cachedWidth = -1;

			function refresh() {
				cachedLines = undefined;
				tui.requestRender();
			}

			function noteText(): string | undefined {
				const t = editor.getText().trim();
				return t.length ? t : undefined;
			}

			function toSideQuestion() {
				focus = "side";
				editor.focused = false;
				sideEditor.focused = true;
				refresh();
			}

			function toOptions() {
				focus = "options";
				editor.focused = false;
				sideEditor.focused = false;
				refresh();
			}

			function response(): QuizResponse {
				const note = noteText();
				return dontKnow
					? { dontKnow: true, note, answers: [] }
					: { dontKnow: false, note, answers: chosen ? [chosen] : [] };
			}

			function handleInput(data: string) {
				if (phase === "feedback") {
					if (matchesKey(data, Key.enter) || matchesKey(data, Key.escape)) {
						done(response());
					}
					return;
				}

				if (focus === "side") {
					if (matchesKey(data, Key.enter)) {
						const text = sideEditor.getText().trim();
						if (text.length > 0) {
							done({
								dontKnow: false,
								sideQuestion: true,
								sideQuestionText: text,
								answers: [],
							});
							return;
						}
						toOptions();
						return;
					}
					if (matchesKey(data, Key.escape)) {
						toOptions();
						return;
					}
					sideEditor.handleInput(data);
					tui.requestRender();
					return;
				}

				if (matchesKey(data, Key.tab)) {
					focus = focus === "options" ? "note" : "options";
					editor.focused = focus === "note";
					refresh();
					return;
				}

				if (focus === "note") {
					if (matchesKey(data, Key.enter) || matchesKey(data, Key.escape)) {
						toOptions();
						return;
					}
					editor.handleInput(data);
					tui.requestRender();
					return;
				}

				if (data === "?" || data === "s" || data === "S") {
					toSideQuestion();
					return;
				}

				if (matchesKey(data, Key.up)) {
					optionIndex = Math.max(0, optionIndex - 1);
					refresh();
					return;
				}
				if (matchesKey(data, Key.down)) {
					optionIndex = Math.min(dontKnowNav, optionIndex + 1);
					refresh();
					return;
				}
				if (matchesKey(data, Key.enter)) {
					if (optionIndex === sideNav) {
						toSideQuestion();
						return;
					}
					if (optionIndex === dontKnowNav) {
						dontKnow = true;
						chosen = null;
					} else {
						const selected = allOptions[optionIndex];
						chosen = { label: selected.label, value: selected.value, index: selected.index };
						dontKnow = false;
					}
					phase = "feedback";
					refresh();
					return;
				}
				if (matchesKey(data, Key.escape)) {
					done(null);
				}
			}

			function render(width: number): string[] {
				if (cachedLines && cachedWidth === width) return cachedLines;
				const lines: string[] = [];
				const add = (text: string) => lines.push(truncateToWidth(text, width));
				pushHeader(lines, theme, width, question, context, tier, marks);

				if (phase === "feedback") {
					renderFeedback(
						lines,
						theme,
						width,
						options,
						chosen ? [chosen.index] : [],
						correctIndices,
						explanation,
						dontKnow,
						noteText(),
					);
					add(theme.fg("accent", "─".repeat(width)));
					cachedLines = lines;
					cachedWidth = width;
					return lines;
				}

				lines.push("");
				for (let i = 0; i < allOptions.length; i++) {
					const option = allOptions[i];
					const selected = focus === "options" && i === optionIndex;
					const prefix = selected ? theme.fg("accent", "> ") : "  ";
					const cleanLabel = cleanCliMath(option.label);
					const label = `${option.index}. ${cleanLabel}`;
					const styled = selected ? theme.fg("accent", label) : theme.fg("text", label);
					add(`${prefix}${styled}`);
				}

				pushSideQuestionRow(lines, theme, width, focus === "options" && optionIndex === sideNav);
				if (focus === "side") {
					pushSideQuestionEditor(lines, theme, width, sideEditor);
				}
				pushDontKnowRow(lines, theme, width, focus === "options" && optionIndex === dontKnowNav);
				pushNoteField(lines, theme, width, editor, focus === "note");

				lines.push("");
				if (focus === "side") {
					add(theme.fg("accent", " Type question • Enter ask tutor • Esc cancel"));
				} else if (focus === "note") {
					add(theme.fg("dim", " Type note • Ctrl+J newline • Enter back to options • Tab options • Esc back"));
				} else {
					add(theme.fg("dim", " ↑↓ navigate • Enter select • ?: side question • Tab note • Esc cancel"));
				}
				add(theme.fg("accent", "─".repeat(width)));
				if (focus === "options") {
					cachedLines = lines;
					cachedWidth = width;
				}
				return lines;
			}

			return {
				render,
				invalidate: () => {
					cachedLines = undefined;
					editor.invalidate();
					sideEditor.invalidate();
				},
				handleInput,
			};
		},
	);
}

async function askMultiChoice(
	ctx: any,
	question: string,
	context: string | undefined,
	tier: string | undefined,
	marks: number | undefined,
	options: QuizOption[],
	correctIndices: number[],
	explanation: string | undefined,
): Promise<QuizResponse | null> {
	const DONT_KNOW_ID = "dont-know";
	const SIDE_QUESTION_ID = "side-question";
	const choiceItems: DisplayOption[] = options.map((option, index) => ({
		...option,
		id: `option:${index}`,
		index: index + 1,
	}));
	const dontKnowItem: DisplayOption = {
		id: DONT_KNOW_ID,
		label: DONT_KNOW_LABEL,
		value: DONT_KNOW_VALUE,
		index: DONT_KNOW_INDEX,
	};
	const sideQuestionItem: DisplayOption = {
		id: SIDE_QUESTION_ID,
		label: "Ask a side question / clarification (/side)",
		value: "__side_question__",
		index: -2,
	};
	const submitItem: DisplayOption = { id: "submit", label: "Submit", value: "__submit__", index: -1, isSubmit: true };
	const allItems: DisplayOption[] = [...choiceItems, dontKnowItem, sideQuestionItem, submitItem];

	return ctx.ui.custom<QuizResponse | null>(
		(tui: any, theme: any, _kb: any, done: (result: QuizResponse | null) => void) => {
			let optionIndex = 0;
			let phase: "select" | "feedback" = "select";
			let focus: "options" | "note" | "side" = "options";
			const editor = makeNoteEditor(tui, theme);
			const sideEditor = makeNoteEditor(tui, theme);
			let cachedLines: string[] | undefined;
			let cachedWidth = -1;
			const selected = new Map<string, OptionAnswer>();

			function refresh() {
				cachedLines = undefined;
				tui.requestRender();
			}

			function noteText(): string | undefined {
				const t = editor.getText().trim();
				return t.length ? t : undefined;
			}

			function toSideQuestion() {
				focus = "side";
				editor.focused = false;
				sideEditor.focused = true;
				refresh();
			}

			function toOptions() {
				focus = "options";
				editor.focused = false;
				sideEditor.focused = false;
				refresh();
			}

			const choseDontKnow = () => selected.has(DONT_KNOW_ID);
			const realAnswers = () =>
				sortAnswers(Array.from(selected.values()).filter((a) => a.index !== DONT_KNOW_INDEX));

			function response(): QuizResponse {
				const note = noteText();
				return choseDontKnow()
					? { dontKnow: true, note, answers: [] }
					: { dontKnow: false, note, answers: realAnswers() };
			}

			function toggleOption(item: DisplayOption) {
				if (item.id === DONT_KNOW_ID) {
					if (selected.has(DONT_KNOW_ID)) {
						selected.delete(DONT_KNOW_ID);
					} else {
						selected.clear();
						selected.set(DONT_KNOW_ID, { label: item.label, value: item.value, index: item.index });
					}
				} else {
					selected.delete(DONT_KNOW_ID);
					if (selected.has(item.id)) {
						selected.delete(item.id);
					} else {
						selected.set(item.id, { label: item.label, value: item.value, index: item.index });
					}
				}
				refresh();
			}

			function submit() {
				if (selected.size === 0) return;
				phase = "feedback";
				refresh();
			}

			function handleInput(data: string) {
				if (phase === "feedback") {
					if (matchesKey(data, Key.enter) || matchesKey(data, Key.escape)) {
						done(response());
					}
					return;
				}

				if (focus === "side") {
					if (matchesKey(data, Key.enter)) {
						const text = sideEditor.getText().trim();
						if (text.length > 0) {
							done({
								dontKnow: false,
								sideQuestion: true,
								sideQuestionText: text,
								answers: [],
							});
							return;
						}
						toOptions();
						return;
					}
					if (matchesKey(data, Key.escape)) {
						toOptions();
						return;
					}
					sideEditor.handleInput(data);
					tui.requestRender();
					return;
				}

				if (matchesKey(data, Key.tab)) {
					focus = focus === "options" ? "note" : "options";
					editor.focused = focus === "note";
					refresh();
					return;
				}

				if (focus === "note") {
					if (matchesKey(data, Key.enter) || matchesKey(data, Key.escape)) {
						toOptions();
						return;
					}
					editor.handleInput(data);
					tui.requestRender();
					return;
				}

				if (data === "?" || data === "s" || data === "S") {
					toSideQuestion();
					return;
				}

				if (matchesKey(data, Key.up)) {
					optionIndex = Math.max(0, optionIndex - 1);
					refresh();
					return;
				}
				if (matchesKey(data, Key.down)) {
					optionIndex = Math.min(allItems.length - 1, optionIndex + 1);
					refresh();
					return;
				}

				const current = allItems[optionIndex];
				if (current.id === SIDE_QUESTION_ID) {
					if (matchesKey(data, Key.enter) || matchesKey(data, Key.space)) {
						toSideQuestion();
						return;
					}
				}

				if (matchesKey(data, Key.space)) {
					if (current.isSubmit) return;
					toggleOption(current);
					return;
				}

				if (matchesKey(data, Key.enter)) {
					if (current.isSubmit) {
						submit();
						return;
					}
					toggleOption(current);
					return;
				}

				if (matchesKey(data, Key.escape)) {
					done(null);
				}
			}

			function render(width: number): string[] {
				if (cachedLines && cachedWidth === width) return cachedLines;
				const lines: string[] = [];
				const add = (text: string) => lines.push(truncateToWidth(text, width));
				pushHeader(lines, theme, width, question, context, tier, marks);

				if (phase === "feedback") {
					renderFeedback(
						lines,
						theme,
						width,
						options,
						realAnswers().map((a) => a.index),
						correctIndices,
						explanation,
						choseDontKnow(),
						noteText(),
					);
					add(theme.fg("accent", "─".repeat(width)));
					cachedLines = lines;
					cachedWidth = width;
					return lines;
				}

				lines.push("");
				for (let i = 0; i < allItems.length; i++) {
					const item = allItems[i];
					const isFocused = focus === "options" && i === optionIndex;
					const prefix = isFocused ? theme.fg("accent", "> ") : "  ";

					if (item.isSubmit) {
						const label = selected.size > 0 ? `✓ ${item.label} (${selected.size} selected)` : `○ ${item.label}`;
						const styled = isFocused
							? theme.fg("accent", label)
							: theme.fg(selected.size > 0 ? "success" : "dim", label);
						add(`${prefix}${styled}`);
						continue;
					}

					if (item.id === SIDE_QUESTION_ID) {
						pushSideQuestionRow(lines, theme, width, isFocused);
						if (focus === "side") {
							pushSideQuestionEditor(lines, theme, width, sideEditor);
						}
						continue;
					}

					if (item.id === DONT_KNOW_ID) {
						lines.push("");
						const checked = selected.has(item.id);
						const label = `${checked ? "[x]" : "[ ]"} ${item.label}`;
						const styled = isFocused ? theme.fg("accent", label) : theme.fg(checked ? "warning" : "dim", label);
						add(`${prefix}${styled}`);
						continue;
					}

					const checked = selected.has(item.id);
					const marker = checked ? "[x]" : "[ ]";
					const cleanLabel = cleanCliMath(item.label);
					const label = `${marker} ${item.index}. ${cleanLabel}`;
					const styled = isFocused ? theme.fg("accent", label) : theme.fg(checked ? "success" : "text", label);
					add(`${prefix}${styled}`);
				}

				pushNoteField(lines, theme, width, editor, focus === "note");

				lines.push("");
				if (focus === "side") {
					add(theme.fg("accent", " Type question • Enter ask tutor • Esc cancel"));
				} else if (focus === "note") {
					add(theme.fg("dim", " Type note • Ctrl+J newline • Enter back to options • Tab options • Esc back"));
				} else {
					if (selected.size === 0) {
						add(theme.fg("warning", " Select at least one answer before submitting."));
					}
					add(theme.fg("dim", " ↑↓ navigate • Space toggle • Enter submit • ?: side question • Tab note • Esc cancel"));
				}
				add(theme.fg("accent", "─".repeat(width)));
				if (focus === "options") {
					cachedLines = lines;
					cachedWidth = width;
				}
				return lines;
			}

			return {
				render,
				invalidate: () => {
					cachedLines = undefined;
					editor.invalidate();
					sideEditor.invalidate();
				},
				handleInput,
			};
		},
	);
}

function renderFeedback(
	lines: string[],
	theme: any,
	width: number,
	options: QuizOption[],
	selectedIndices: number[],
	correctIndices: number[],
	explanation: string | undefined,
	dontKnow = false,
	note?: string,
): void {
	const add = (text: string) => lines.push(truncateToWidth(text, width));
	const correct = !dontKnow && isCorrect(selectedIndices, correctIndices);
	const selectedSet = new Set(selectedIndices);
	const correctSet = new Set(correctIndices);

	lines.push("");
	for (let i = 0; i < options.length; i++) {
		const index = i + 1;
		const opt = options[i];
		const isSelected = selectedSet.has(index);
		const isKey = correctSet.has(index);
		let marker: string;
		let color: string;
		if (dontKnow) {
			marker = isKey ? "✓" : " ";
			color = isKey ? "success" : "dim";
		} else if (isSelected && isKey) {
			marker = "✓";
			color = "success";
		} else if (isSelected && !isKey) {
			marker = "✗";
			color = "error";
		} else if (!isSelected && isKey) {
			marker = "✓";
			color = "success";
		} else {
			marker = " ";
			color = "dim";
		}
		const cleanLabel = cleanCliMath(opt.label);
		let row = ` ${marker} ${index}. ${cleanLabel}`;
		if (opt.description) {
			row += ` — ${cleanCliMath(opt.description)}`;
		}
		add(theme.fg(color, row));
	}

	lines.push("");
	if (dontKnow) {
		add(theme.fg("warning", " · You selected: I don't know (Knowledge gap flagged)"));
		const correctStr = correctIndices.map((i) => formatOptionRef(options, i)).join(", ");
		addWrapped(lines, theme.fg("muted", `Correct answer: ${correctStr}`), width, " ");
	} else if (correct) {
		add(theme.fg("success", " ✓ Correct!"));
	} else {
		add(theme.fg("error", " ✗ Incorrect."));
		const correctStr = correctIndices.map((i) => formatOptionRef(options, i)).join(", ");
		addWrapped(lines, theme.fg("muted", `Correct answer: ${correctStr}`), width, " ");
	}
	if (note) {
		addWrapped(lines, theme.fg("muted", `Your note: ${cleanCliMath(note)}`), width, " ");
	}
	if (explanation) {
		lines.push("");
		addWrapped(lines, theme.fg("text", cleanCliMath(explanation)), width, " ");
	}
	lines.push("");
	add(theme.fg("dim", " Enter/Esc to continue"));
}

function sortAnswers(answers: OptionAnswer[]): OptionAnswer[] {
	return [...answers].sort((a, b) => a.index - b.index);
}

const SHARED_UI_LOCK_KEY = "__piSharedUiLock";
function getSharedUiLock() {
	const g = globalThis as any;
	if (!g[SHARED_UI_LOCK_KEY]) {
		let chain: Promise<void> = Promise.resolve();
		g[SHARED_UI_LOCK_KEY] = {
			withLock<T>(fn: () => T | Promise<T>): Promise<T> {
				const prev = chain;
				let release: () => void;
				chain = new Promise<void>((r) => { release = r; });
				return prev.then(fn).finally(() => release!());
			},
		};
	}
	return g[SHARED_UI_LOCK_KEY] as { withLock<T>(fn: () => T | Promise<T>): Promise<T> };
}
const sharedUiLock = getSharedUiLock();

function withUILock<T>(fn: () => Promise<T>): Promise<T> {
	return sharedUiLock.withLock(fn);
}

export default function quiz(pi: ExtensionAPI) {
	pi.registerTool({
		name: "quiz",
		label: "quiz",
		description:
			"A-Level STEM Graded Assessment & Mark Scheme Engine. Supports diagnostic options mode (single/multi-select with 'I don't know') and authentic Tier 3 Exam Working mode with official Mark Scheme audit (M/A/B marks).",
		promptSnippet:
			"Use the quiz tool to assess the student with a graded question (Tier 1 Foundational, Tier 2 Intermediate, or Tier 3 Exam Question with official Mark Scheme).",
		parameters: QuizParams,

		async execute(_toolCallId, params, signal, onUpdate, ctx) {
			const context = params.details?.trim() || undefined;
			const explanation = params.explanation.trim();
			const tier = params.tier?.trim() || undefined;
			const marks = params.marks;
			const isExamMode = params.examMode === true || !params.options || params.options.length === 0;

			if (signal?.aborted) {
				return {
					content: [{ type: "text", text: "User cancelled the quiz" }],
					details: { status: "cancelled", question: params.question, tier, marks, mode: isExamMode ? "exam-working" : "single-select" },
				};
			}

			if (!ctx.hasUI) {
				return {
					content: [{ type: "text", text: "quiz requires interactive mode UI" }],
					details: { status: "unavailable", question: params.question, tier, marks, mode: isExamMode ? "exam-working" : "single-select" },
				};
			}

			// Branch 1: Exam Working Mode (Tier 3 free-form with Mark Scheme)
			if (isExamMode) {
				return withUILock(async () => {
					const response = await askExamWorking(
						ctx,
						params.question,
						context,
						tier,
						marks,
						params.markScheme as MarkSchemePoint[] | undefined,
						explanation,
					);
					if (!response) {
						return {
							content: [{ type: "text", text: "User cancelled exam question" }],
							details: { status: "cancelled", question: params.question, tier, marks, mode: "exam-working" },
						};
					}

					if (response.sideQuestion) {
						const sideQ = response.sideQuestionText || response.freeText || "Clarification requested";
						return {
							content: [{
								type: "text",
								text: `[STUDENT PAUSED EXAM QUESTION FOR A SIDE CLARIFICATION]:\n"${sideQ}"\n\nINSTRUCTIONS FOR TUTOR:\n1. Answer the student's question directly and concisely from first principles (e.g. explain where that specific term, coefficient, rule, or sign comes from).\n2. DO NOT reveal the final solution or mark scheme for this exam question yet.\n3. Instruct the student to type 'continue' when they are ready to resume this exam question.`,
							}],
							details: {
								status: "side-question",
								studentQuestion: sideQ,
								question: params.question,
								tier,
								marks,
								context,
								mode: "exam-working",
								explanation,
							},
						};
					}

					let text = `User completed exam-style question [${tier || "Tier 3"}] [${marks || "?"} Marks].`;
					if (response.freeText) text += `\nStudent Working: ${response.freeText}`;
					if (params.markScheme && params.markScheme.length > 0) {
						text += `\n\nOfficial Mark Scheme:`;
						for (const pt of params.markScheme) {
							text += `\n- [${pt.type}${pt.marks}] ${pt.criterion}`;
						}
					}
					text += `\nModel Solution: ${explanation}`;

					return {
						content: [{ type: "text", text }],
						details: {
							status: "answered",
							question: params.question,
							tier,
							marks,
							context,
							mode: "exam-working" as QuizMode,
							answers: [],
							correctIndices: [],
							freeText: response.freeText,
							markScheme: params.markScheme as MarkSchemePoint[],
							explanation,
						},
					};
				});
			}

			// Branch 2: Standard MCQ Diagnostic Mode
			const mode: QuizMode = params.multiSelect ? "multi-select" : "single-select";
			let options: QuizOption[];
			try {
				options = normalizeOptions(params.options);
			} catch (e) {
				return {
					content: [{ type: "text", text: `quiz error: ${(e as Error).message}` }],
					details: { status: "unavailable", question: params.question, tier, marks, mode, message: (e as Error).message },
				};
			}

			if (params.shuffle !== false) {
				options = shuffleOptions(options);
			}

			onUpdate?.({
				content: [{ type: "text", text: "Awaiting user response..." }],
				details: { options: options.map((o, i) => ({ index: i + 1, label: o.label })) },
			});

			const { indices: correctIndices, error: correctError } = resolveCorrect(
				params.correctAnswer as string | string[],
				options,
			);

			if (correctError) {
				return {
					content: [{ type: "text", text: `quiz error: ${correctError}` }],
					details: { status: "unavailable", question: params.question, tier, marks, mode, message: correctError },
				};
			}

			return withUILock(async () => {
				const response =
					mode === "single-select"
						? await askSingleChoice(ctx, params.question, context, tier, marks, options, correctIndices, explanation)
						: await askMultiChoice(ctx, params.question, context, tier, marks, options, correctIndices, explanation);
				if (!response) {
					return {
						content: [{ type: "text", text: "User cancelled the quiz" }],
						details: { status: "cancelled", question: params.question, tier, marks, mode, answers: [], correctIndices },
					};
				}

				if (response.sideQuestion) {
					const sideQ = response.sideQuestionText || response.note || "Clarification requested";
					return {
						content: [{
							type: "text",
							text: `[STUDENT PAUSED THIS QUIZ QUESTION TO ASK A SIDE CLARIFICATION]:\n"${sideQ}"\n\nINSTRUCTIONS FOR TUTOR:\n1. Answer the student's question directly and concisely from first principles (e.g. explain where that specific term, number, or rule comes from).\n2. DO NOT reveal the correct option or final answer to this quiz question.\n3. Instruct the student to type 'continue' when they are ready to resume this quiz question.`,
						}],
						details: {
							status: "side-question",
							studentQuestion: sideQ,
							question: params.question,
							tier,
							marks,
							context,
							mode,
							answers: [],
							correctIndices,
							explanation,
						},
					};
				}

				const { dontKnow, note, answers } = response;
				const selectedIndices = answers.map((a) => a.index);
				const correct = dontKnow ? false : isCorrect(selectedIndices, correctIndices);
				const correctStr = correctIndices.map((i) => formatOptionRef(options, i)).join(", ");

				let text = "";
				if (tier) text += `[${tier}] `;
				if (marks !== undefined) text += `[${marks} Marks] `;
				if (dontKnow) {
					text += `User selected "I don't know" — genuine knowledge gap identified.\nCorrect: ${correctStr}`;
				} else {
					text += `User answered ${correct ? "correctly ✓" : "incorrectly ✗"}.\nSelected: ${answers.map((a) => `${a.index}. ${a.label}`).join(", ")}\nCorrect: ${correctStr}`;
				}
				if (note) text += `\nStudent Note: ${note}`;
				text += `\nExplanation: ${explanation}`;

				return {
					content: [{ type: "text", text }],
					details: {
						status: "answered",
						question: params.question,
						tier,
						marks,
						context,
						mode,
						answers,
						correctIndices,
						options: options.map((o, i) => ({ index: i + 1, label: o.label })),
						correct,
						dontKnow,
						note,
						explanation,
					},
				};
			});
		},

		renderCall(args, theme) {
			let prefix = "quiz ";
			if (args.tier) prefix = `quiz [${args.tier}] `;
			let text = theme.fg("toolTitle", theme.bold(prefix)) + theme.fg("muted", args.question);
			if (args.marks) text += theme.fg("accent", ` [${args.marks}M]`);
			return new Text(text, 0, 0);
		},

		renderResult(result, _options, theme) {
			const details = result.details as QuizResultDetails | undefined;
			if (!details) {
				const first = result.content[0];
				return new Text(first?.type === "text" ? first.text : "", 0, 0);
			}

			if (details.status === "cancelled") {
				return new Text(theme.fg("warning", details.message || "Cancelled"), 0, 0);
			}
			if (details.status === "unavailable") {
				return new Text(theme.fg("warning", details.message || "quiz unavailable"), 0, 0);
			}

			if (details.mode === "exam-working") {
				const lines = [
					theme.fg("accent", theme.bold(`Exam Question Completed [${details.tier || "Tier 3"}]`)),
				];
				if (details.freeText) {
					lines.push(theme.fg("text", `Working: ${details.freeText}`));
				}
				if (details.explanation) {
					lines.push(theme.fg("dim", `Model Solution: ${details.explanation.slice(0, 100)}...`));
				}
				return new Text(lines.join("\n"), 0, 0);
			}

			const correctSet = new Set(details.correctIndices);
			const selectedSet = new Set(details.answers.map((a) => a.index));
			const lines: string[] = [];

			const displayed = details.options || details.answers.map((a) => ({ index: a.index, label: a.label }));
			for (const opt of displayed) {
				const isSelected = selectedSet.has(opt.index);
				const isKey = correctSet.has(opt.index);
				let mark = "  ";
				let color = "dim";
				if (details.dontKnow) {
					mark = isKey ? "✓ " : "  ";
					color = isKey ? "success" : "dim";
				} else if (isSelected && isKey) {
					mark = "✓ ";
					color = "success";
				} else if (isSelected && !isKey) {
					mark = "✗ ";
					color = "error";
				} else if (!isSelected && isKey) {
					mark = "✓ ";
					color = "success";
				}
				lines.push(`${theme.fg(color, mark)}${theme.fg(isSelected ? "accent" : color, `${opt.index}. ${opt.label}`)}`);
			}

			lines.push("");
			const verdict = details.dontKnow
				? theme.fg("warning", "I don't know")
				: details.correct
					? theme.fg("success", "Correct! ✓")
					: theme.fg("error", "Incorrect ✗");
			lines.push(verdict);
			if (details.note) lines.push(theme.fg("muted", `Note: ${details.note}`));
			return new Text(lines.join("\n"), 0, 0);
		},
	});
}
