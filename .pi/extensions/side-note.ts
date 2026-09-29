/**
 * side-note — Interactive Side Question & Concept Clarification for theta-learn.
 *
 * Allows students to ask targeted side questions about any equation, term, or concept
 * (e.g. "/side where did -1 come from?") without interfering with the
 * ongoing lesson context or failing an active quiz.
 *
 * Commands:
 *   /side <question>             — Ask a targeted clarification or "where did X come from?"
 *   /sidenote <question>         — Alias for /side
 *   /sideconversation <question> — Alias for /side
 *   /aside <question>            — Alias for /side
 *   /continue                    — Resume the main lesson after a side-note
 */

export default function sideNote(pi: any) {
	async function handleSideCommand(args: string, ctx: any) {
		let question = (args || "").trim();

		// If no question was provided on the command line, prompt interactively
		if (!question && ctx.ui && typeof ctx.ui.editor === "function") {
			const promptResult = await ctx.ui.editor(
				"Ask a side question about a step/equation (e.g. where did -1 come from?):"
			);
			if (promptResult) {
				question = promptResult.trim();
			}
		}

		if (!question) {
			ctx.ui.notify("Usage: /side <your question or doubt about an equation/concept>", "warning");
			return;
		}

		const prompt = [
			`[SIDE NOTE / CONCEPT CLARIFICATION REQUEST]`,
			`The student is asking a specific side-question about the current step/equation:`,
			`"${question}"`,
			``,
			`INSTRUCTIONS FOR TUTOR:`,
			`1. Pause the main lesson progression. DO NOT advance to the next topic or reveal the final answer to any pending quiz problem.`,
			`2. Provide a direct, crystal-clear explanation specifically answering the student's question (e.g. explain exactly where that term, coefficient, rule, or sign came from step-by-step from first principles).`,
			`3. Conclude your response with:`,
			`   "💡 *When you're ready to jump back into the main lesson/question, just type **continue**.*"`,
		].join("\n");

		pi.sendUserMessage(prompt);
		if (ctx.ui && typeof ctx.ui.notify === "function") {
			ctx.ui.notify("Side note sent. Type 'continue' when ready to resume the lesson.", "info");
		}
	}

	async function handleContinueCommand(_args: string, _ctx: any) {
		const prompt = [
			`[RESUME MAIN LESSON]`,
			`The student has understood the side explanation and is ready to continue.`,
			``,
			`INSTRUCTIONS FOR TUTOR:`,
			`1. Briefly re-anchor the student: state the exact step, derivation, or question we were working on before the side note.`,
			`2. Present the active question or prompt the student for the next step to continue the lesson.`,
		].join("\n");

		pi.sendUserMessage(prompt);
	}

	pi.registerCommand("side", {
		description: "Ask a side-question about a step, equation, or term without losing lesson context",
		handler: handleSideCommand,
	});

	pi.registerCommand("sidenote", {
		description: "Alias for /side",
		handler: handleSideCommand,
	});

	pi.registerCommand("sideconversation", {
		description: "Alias for /side",
		handler: handleSideCommand,
	});

	pi.registerCommand("aside", {
		description: "Alias for /side",
		handler: handleSideCommand,
	});

	pi.registerCommand("continue", {
		description: "Resume the main lesson after a side-note clarification",
		handler: handleContinueCommand,
	});
}
