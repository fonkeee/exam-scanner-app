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

    // New prompt: Solve the exam
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

**EXAMPLE:**
Q: kochen →
A: gekocht

Q: Morgens macht er ein ______.
A: Frühstück

Q: Murat war in Bodrum. (Richtig/Falsch)
A: Richtig

**DO NOT** include any extra text, explanations, or commentary. Only the Q/A pairs.

Now process the two exam page images.
`;

    const MODEL_NAME = 'models/gemini-2.0-flash'; // or gemini-2.5-flash

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
            temperature: 0.2,   // low for factual answers
            maxOutputTokens: 4096,
            topP: 0.9
        }
    };

    try {
        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/${MODEL_NAME}:generateContent?key=${GEMINI_API_KEY}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody)
            }
        );

        const data = await response.json();
        if (!response.ok) {
            console.error('Gemini error:', JSON.stringify(data, null, 2));
            return res.status(response.status).json({ error: data.error?.message || 'Gemini API error' });
        }

        let extractedText = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!extractedText) {
            return res.status(500).json({ error: 'Empty response from Gemini' });
        }

        extractedText = extractedText.replace(/```/g, '').trim();
        return res.status(200).json({ extractedText });
    } catch (error) {
        console.error('Server error:', error);
        return res.status(500).json({ error: 'Internal server error: ' + error.message });
    }
}
