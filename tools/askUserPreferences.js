import { ask } from "../lib/cliInput.js";
import { createToolHandler } from "./template.js";

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------
export const ask_user_preferences_schema = {
    type: "function",
    function: {
        name: "ask_user_preferences",
        description:
            "Uses for ambiguity resolution or asking for user preferences. " +
            "Each question includes a list of numbered choices. The last choice is " +
            "always a custom-input option: " + "the user types the option number, " +
            "then manually types their preference. " +
            "All questions are provided at once to save input tokens; the tool loops " +
            "through them and returns a structured summary of all answers.",
        parameters: {
            type: "object",
            properties: {
                questions: {
                    type: "array",
                    description:
                        "Array of preference questions to ask the user.",
                    items: {
                        type: "object",
                        properties: {
                            question_text: {
                                type: "string",
                                description: "The question text to display.",
                            },
                            choices: {
                                type: "array",
                                description:
                                    "The list of options to choose from. " +
                                    "The last choice is always treated as a custom-input option.",
                                items: { type: "string" },
                            },
                        },
                        required: ["question_text", "choices"],
                    },
                },
            },
            required: ["questions"],
        },
    },
};

// ---------------------------------------------------------------------------
// Pure handler logic (no consent -- prompts user, non-destructive)
// ---------------------------------------------------------------------------
async function askUserPreferencesCore({ questions }) {
    if (!Array.isArray(questions) || questions.length === 0) {
        return "No questions provided.";
    }

    const results = [];

    for (let qi = 0; qi < questions.length; qi++) {
        const q = questions[qi];
        const questionText = q.question_text || `Question ${qi + 1}`;
        const choices = Array.isArray(q.choices) ? q.choices : [];

        if (choices.length === 0) {
            const answer = await ask(`\n${questionText}\n> `);
            results.push({ question: questionText, answer });
            continue;
        }

        console.log(`\n${questionText}`);
        const lastIdx = choices.length + 1;
        for (let ci = 0; ci < choices.length; ci++) {
            console.log(`${ci + 1}. ${choices[ci]}`);
        }
        console.log(`${lastIdx}. (Type your own custom preference)`);

        const choice = await ask("Enter your choice (number): ");
        const choiceNum = parseInt(choice.trim(), 10);

        let answer;
        if (choiceNum === lastIdx) {
            answer = await ask("Enter your custom preference: ");
        } else if (choiceNum >= 1 && choiceNum <= choices.length) {
            answer = choices[choiceNum - 1];
        } else {
            answer = choice.trim();
        }

        results.push({ question: questionText, answer });
    }

    const outputLines = ["[User Preferences]"];
    for (const r of results) {
        outputLines.push(`Q: ${r.question}`);
        outputLines.push(`A: ${r.answer}`);
        outputLines.push("");
    }

    const result = outputLines.join("\n");
    console.log(`\n\x1b[92m${result}\x1b[0m`);
    return result;
}

// ---------------------------------------------------------------------------
// Wrapped handler (no consent -- prompts user, non-destructive)
// ---------------------------------------------------------------------------
export const ask_user_preferences = createToolHandler(
    "ask_user_preferences",
    askUserPreferencesCore,
    false
);
