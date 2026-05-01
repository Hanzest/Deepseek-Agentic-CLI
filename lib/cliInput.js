import readline from "readline";

// ---------------------------------------------------------------------------
// Console input helper
// ---------------------------------------------------------------------------
export function ask(question) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });
    return new Promise((resolve) => {
        rl.question(question, (answer) => {
            rl.close();
            resolve(answer);
        });
    });
}

// ---------------------------------------------------------------------------
// Model selection
// ---------------------------------------------------------------------------
export async function startChat() {
    console.log("Choose a model to interact with:");
    console.log("1. deepseek-v4-flash");
    console.log("2. deepseek-v4-pro");

    const model_choice = await ask("Enter your choice (1 or 2): ");

    if (model_choice === "1") {
        return "deepseek-v4-flash";
    } else if (model_choice === "2") {
        return "deepseek-v4-pro";
    } else {
        console.log("Invalid choice. Using deepseek-v4-flash by default.");
        return "deepseek-v4-flash";
    }
}

// ---------------------------------------------------------------------------
// Reasoning / thinking toggle
// ---------------------------------------------------------------------------
export async function thinkingToggle() {
    console.log("Choose reasoning content option:");
    console.log("1. Disabled");
    console.log("2. Enabled");

    const choice = await ask("Enter your choice (1 or 2): ");

    if (choice === "1") {
        return { thinking: { type: "disabled" } };
    } else if (choice === "2") {
        return { thinking: { type: "enabled" } };
    } else {
        console.log("Invalid choice. Disabled reasoning content by default.");
        return { thinking: { type: "disabled" } };
    }
}
