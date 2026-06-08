// api/gemini.js
export default async function handler(req, res) {
    // Set CORS headers for safety
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST');
    
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { page1, page2 } = req.body;
        if (!page1 || !page2) {
            return res.status(400).json({ error: 'Both page images are required' });
        }

        const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
        if (!GEMINI_API_KEY) {
            console.error('Missing GEMINI_API_KEY');
            return res.status(500).json({ error: 'Server configuration: missing API key' });
        }

        // Extract base64 safely
        let base64Page1, base64Page2;
        try {
            base64Page1 = page1.split(',')[1];
            base64Page2 = page2.split(',')[1];
            if (!base64Page1 || !base64Page2) throw new Error('Invalid image data');
        } catch (err) {
            return res.status(400).json({ error: 'Invalid image format' });
        }

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

        const modelsToTry = [
            'models/gemini-2.0-flash-lite',
            'models/gemini-1.5-flash',
            'models/gemini-2.5-flash'
        ];

        async function callGemini(modelName) {
            console.log(`[Gemini] Trying model: ${modelName}`);
            const requestBody = {
                contents: [{
                    parts: [
                        { text: prompt },
                        { inline_data: { mime_type: "image/jpeg", data: base64Page1 } },
                        { inline_data: { mime_type: "image/jpeg", data: base64Page2 } }
                    ]
                }],
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
                const errorMsg = data.error?.message || 'Unknown error';
                console.error(`[Gemini] ${modelName} failed:`, errorMsg);
                throw new Error(errorMsg);
            }
            const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
            if (!text) throw new Error('Empty response');
            return text;
        }

        let lastError = null;
        for (const model of modelsToTry) {
            try {
                const extractedText = await callGemini(model);
                const cleaned = extractedText.replace(/```/g, '').trim();
                console.log(`[Gemini] Success with ${model}`);
                return res.status(200).json({ extractedText: cleaned });
            } catch (err) {
                console.error(`[Gemini] Error with ${model}:`, err.message);
                lastError = err;
                continue;
            }
        }

        return res.status(429).json({ error: 'All models failed. Quota exceeded or API error: ' + (lastError?.message || 'Unknown') });
    } catch (err) {
        console.error('Unhandled error:', err);
        return res.status(500).json({ error: 'Internal server error: ' + err.message });
    }
}
