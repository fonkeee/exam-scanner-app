// api/gemini.js
export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { page1, page2 } = req.body;
    if (!page1 || !page2) {
        return res.status(400).json({ error: 'Both page images are required' });
    }

    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    if (!GEMINI_API_KEY) {
        console.error('Missing GEMINI_API_KEY');
        return res.status(500).json({ error: 'Missing API key' });
    }

    const base64Page1 = page1.split(',')[1];
    const base64Page2 = page2.split(',')[1];

    const prompt = `
You are an expert exam solver. Look at the two exam page images. The pages contain **printed questions** (no handwritten answers). Your task is to **provide the correct answers** for every question.

**INSTRUCTIONS:**
- Read each question carefully.
- For each question, output the correct answer.
- If the question is multiple-choice, output the correct letter (A, B, C, etc.) and the text.
- If the question requires a fill-in-the-blank, output the missing word(s).
- If the question is true/false, output "Richtig" or "Falsch".
- If the question asks for a verb conjugation (e.g., "kochen →"), output the correct form (e.g., "gekocht").
- For open-ended questions, provide a concise, correct answer.

**OUTPUT FORMAT:** 
For each question, write exactly:
Q: [question text as printed]
A: [correct answer]

Separate each Q/A pair with a blank line.

**DO NOT** include any extra text, explanations, or commentary. Only the Q/A pairs.
`;

    // Try different models in order (some may have quota left)
    const modelsToTry = [
        'models/gemini-2.5-flash',
        'models/gemini-1.5-flash',
        'models/gemini-2.0-flash-lite',
        'models/gemini-3.1-flash-lite-preview'
    ];

    async function callGemini(modelName, retryDelay = 0) {
        if (retryDelay > 0) {
            console.log(`Retrying with ${modelName} after ${retryDelay}ms...`);
            await new Promise(resolve => setTimeout(resolve, retryDelay));
        }

        const requestBody = {
            contents: [
                {
                    parts: [
                        { text: prompt },
                        { inline_data: { mime_type: "image/jpeg", data: base64Page1 } },
                        { inline_data: { mime_type: "image/jpeg", data: base64Page2 } }
                    ]
                }
            ],
            generationConfig: {
                temperature: 0.2,
                maxOutputTokens: 4096,
                topP: 0.9
            }
        };

        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/${modelName}:generateContent?key=${GEMINI_API_KEY}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody)
            }
        );

        const data = await response.json();

        if (!response.ok) {
            const errorMsg = data.error?.message || '';
            // Check if it's a quota error (429)
            if (response.status === 429 && errorMsg.includes('quota')) {
                // Extract retry delay if provided
                const retryMatch = errorMsg.match(/Please retry in ([\d.]+)s/);
                const delay = retryMatch ? parseFloat(retryMatch[1]) * 1000 : 15000;
                throw { isQuota: true, model: modelName, delay };
            }
            throw new Error(`Gemini API error: ${errorMsg}`);
        }

        return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    }

    // Try models with fallback
    let lastError = null;
    for (const model of modelsToTry) {
        try {
            console.log(`Trying model: ${model}`);
            const extractedText = await callGemini(model);
            if (extractedText) {
                const cleaned = extractedText.replace(/```/g, '').trim();
                return res.status(200).json({ extractedText: cleaned });
            }
        } catch (err) {
            console.error(`Model ${model} failed:`, err);
            lastError = err;
            if (err.isQuota) {
                // Quota error: wait and retry same model (once)
                try {
                    console.log(`Quota hit for ${model}, retrying after ${err.delay}ms...`);
                    const extractedText = await callGemini(model, err.delay);
                    if (extractedText) {
                        const cleaned = extractedText.replace(/```/g, '').trim();
                        return res.status(200).json({ extractedText: cleaned });
                    }
                } catch (retryErr) {
                    console.error(`Retry failed for ${model}:`, retryErr);
                    lastError = retryErr;
                    continue;
                }
            } else {
                // Non-quota error, try next model
                continue;
            }
        }
    }

    // All models failed
    const errorMsg = lastError?.message || 'All models failed due to quota or errors. Please try again later.';
    return res.status(429).json({ error: errorMsg });
}
