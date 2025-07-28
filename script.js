document.addEventListener('DOMContentLoaded', () => {
    const sequentialOutput = document.getElementById('sequential-output');
    const advancedOutput = document.getElementById('advanced-output');
    const apiKeyInput = document.getElementById('api-key');
    const runButton = document.getElementById('run-button');
    const runExampleButtons = document.querySelectorAll('.run-example');

    const examples = {
        '1': 'What is the capital of France?',
        '2': 'If a train leaves New York at 2:00 PM and travels at 100 mph, and a second train leaves Los Angeles at 4:00 PM and travels at 120 mph, when will they meet?',
        '3': 'A patient has a fever, a cough, and a headache. What are the possible diagnoses, and how would you test for them?'
    };

    runButton.addEventListener('click', () => {
        const apiKey = apiKeyInput.value;
        if (!apiKey) {
            alert('Please enter an API key.');
            return;
        }
        // This is a placeholder for the actual logic to run the comparison.
        // We will need to implement the logic to call the `advanced-reasoning` tool here.
        sequentialOutput.value = 'Running sequential thinking...';
        advancedOutput.value = 'Running advanced reasoning...';
    });

    runExampleButtons.forEach(button => {
        button.addEventListener('click', () => {
            const exampleId = button.getAttribute('data-example');
            const exampleText = examples[exampleId];
            const apiKey = apiKeyInput.value;
            if (!apiKey) {
                alert('Please enter an API key.');
                return;
            }

            runComparison(apiKey, exampleText);
        });
    });

    async function runComparison(apiKey, prompt) {
        sequentialOutput.value = 'Running sequential thinking...';
        advancedOutput.value = 'Running advanced reasoning...';

        const sequentialPromise = runSequential(apiKey, prompt);
        const advancedPromise = runAdvanced(apiKey, prompt);

        const [sequentialResult, advancedResult] = await Promise.all([sequentialPromise, advancedPromise]);

        sequentialOutput.value = sequentialResult;
        advancedOutput.value = advancedResult;
    }

    async function runSequential(apiKey, prompt) {
        const sequentialChain = new langchain.chains.LLMChain({
            llm: new langchain.llms.OpenAI({ openAIApiKey: apiKey }),
            prompt: new langchain.prompts.PromptTemplate({
                template: "Q: {question}\nA:",
                inputVariables: ["question"],
            }),
        });

        const result = await sequentialChain.call({
            question: prompt,
        });

        return result.text;
    }

    async function runAdvanced(apiKey, prompt) {
        const advancedChain = new langchain.chains.LLMChain({
            llm: new langchain.llms.OpenAI({ openAIApiKey: apiKey }),
            prompt: new langchain.prompts.PromptTemplate({
                template: "Q: {question}\nA: Let's think step by step.",
                inputVariables: ["question"],
            }),
        });

        const result = await advancedChain.call({
            question: prompt,
        });

        return result.text;
    }
});
