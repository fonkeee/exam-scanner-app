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

    // New models order: newest and more likely to have free quota first
    const modelsToTry = [
        'models/gemini-3.1-flash-lite-preview',  // newest as of 2026
        'models/gemini-3-flash-preview',
        'models/gemini-2.5-flash',
        'models/gemini-2.0-flash-lite',
        'models/gemini-1.5-flash'
    ];

    async function callGemini(modelName, retryDelay = 0) {
        if (retryDelay > 0) {
            console.log(`[Gemini] Retry ${modelName} after ${retryDelay}ms`);
            await new Promise(resolve => setTimeout(resolve, retryDelay));
        }
        console.log(`[Gemini] Trying model: ${modelName}`);
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
            console.error(`[Gemini] Model ${modelName} failed:`, errorMsg);
            if (response.status === 429 && errorMsg.includes('quota')) {
                const retryMatch = errorMsg.match(/Please retry in ([\d.]+)s/);
                const delay = retryMatch ? parseFloat(retryMatch[1]) * 1000 : 15000;
                throw { isQuota: true, model: modelName, delay };
            }
            throw new Error(`Gemini error: ${errorMsg}`);
        }
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        console.log(`[Gemini] Model ${modelName} success, response length: ${text.length}`);
        return text;
    }

    let lastError = null;
    for (const model of modelsToTry) {
        try {
            const extractedText = await callGemini(model);
            if (extractedText) {
                const cleaned = extractedText.replace(/```/g, '').trim();
                console.log(`[Gemini] Final success with ${model}`);
                return res.status(200).json({ extractedText: cleaned });
            }
        } catch (err) {
            console.error(`[Gemini] Error with ${model}:`, err);
            lastError = err;
            if (err.isQuota) {
                // Retry same model once after delay
                try {
                    console.log(`[Gemini] Quota for ${model}, retrying after ${err.delay}ms`);
                    const extractedText = await callGemini(model, err.delay);
                    if (extractedText) {
                        const cleaned = extractedText.replace(/```/g, '').trim();
                        return res.status(200).json({ extractedText: cleaned });
                    }
                } catch (retryErr) {
                    console.error(`[Gemini] Retry failed for ${model}:`, retryErr);
                    lastError = retryErr;
                    continue;
                }
            } else {
                continue;
            }
        }
    }
    console.error('[Gemini] All models exhausted');
    const errorMsg = lastError?.message || 'All models failed. Please try again later.';
    return res.status(429).json({ error: errorMsg });
}
