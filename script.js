document.addEventListener('DOMContentLoaded', () => {
    const sequentialOutput = document.getElementById('sequential-output');
    const advancedOutput = document.getElementById('advanced-output');
    const apiKeyInput = document.getElementById('api-key');
    const providerSelect = document.getElementById('provider-select');
    const modelSelect = document.getElementById('model-select');
    const runButton = document.getElementById('run-button');
    const runExampleButtons = document.querySelectorAll('.run-example');

    const examples = {
        '1': 'What is the capital of France?',
        '2': 'If a train leaves New York at 2:00 PM and travels at 100 mph, and a second train leaves Los Angeles at 4:00 PM and travels at 120 mph, when will they meet?',
        '3': 'A patient has a fever, a cough, and a headache. What are the possible diagnoses, and how would you test for them?'
    };

    providerSelect.addEventListener('change', async () => {
        const provider = providerSelect.value;
        const models = await getModels(provider);
        modelSelect.innerHTML = '';
        models.forEach(model => {
            const option = document.createElement('option');
            option.value = model;
            option.textContent = model;
            modelSelect.appendChild(option);
        });
    });

    runButton.addEventListener('click', () => {
        const apiKey = apiKeyInput.value;
        const provider = providerSelect.value;
        const model = modelSelect.value;
        if (!apiKey) {
            alert('Please enter an API key.');
            return;
        }
        if (!provider || !model) {
            alert('Please select a provider and model.');
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

    async function runComparison(apiKey, provider, model, prompt) {
        sequentialOutput.value = 'Running sequential thinking...';
        advancedOutput.value = 'Running advanced reasoning...';

        const sequentialPromise = runSequential(apiKey, provider, model, prompt);
        const advancedPromise = runAdvanced(apiKey, prompt);

        const [sequentialResult, advancedResult] = await Promise.all([sequentialPromise, advancedPromise]);

        sequentialOutput.value = sequentialResult;
        advancedOutput.value = advancedResult;
    }

    async function runSequential(apiKey, provider, model, prompt) {
        const sequentialChain = new langchain.chains.LLMChain({
            llm: new langchain.llms[provider]({ openAIApiKey: apiKey, modelName: model }),
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
        const response = await fetch('/advanced-reasoning', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                apiKey,
                prompt,
            }),
        });

        if (!response.ok) {
            const error = await response.json();
            return `Error: ${error.message}`;
        }

        const result = await response.json();
        return result.content[0].text;
    }

    async function getProviders() {
        const response = await fetch('/providers');
        const providers = await response.json();
        return providers;
    }

    async function getModels(provider) {
        const response = await fetch(`/models?provider=${provider}`);
        const models = await response.json();
        return models;
    }

    async function init() {
        const providers = await getProviders();
        providers.forEach(provider => {
            const option = document.createElement('option');
            option.value = provider;
            option.textContent = provider;
            providerSelect.appendChild(option);
        });
        providerSelect.dispatchEvent(new Event('change'));
    }

    init();
});
