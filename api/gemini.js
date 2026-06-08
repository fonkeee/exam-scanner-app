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

    // CRITICAL: Force Gemini to extract student answers, even if messy
    const prompt = `
You are an AI that extracts **student answers** from exam papers. The images contain a mix of printed questions and handwritten/typed answers by the student.

**YOUR TASK:** For each question, output the **student's answer** exactly as written (including incomplete sentences, abbreviations, or single words). Do NOT invent answers. If the answer is a checkmark, a cross, a circled option, or any mark, describe it (e.g., "✓", "✗", "circled A").

**RULES:**
- Ignore the printed question text when looking for the answer. The answer is **always** written by the student, usually after the question, below it, or in a blank space.
- If the student wrote "gekocht" for "kochen", extract "gekocht".
- If the student wrote nothing but left a blank line, output "[blank]".
- If the student wrote only a checkmark or an X, output "✓" or "✗".
- Do NOT output "[No answer given]" unless the space is completely empty and there is no mark at all.
- For fill-in-the-blank exercises (e.g., "Morgens macht er ein ______"), look for the word the student inserted, either underlined or written in the blank.

**OUTPUT FORMAT:** 
Q: [question text as printed]
A: [student's answer exactly as written]

Use a blank line between each Q/A pair.

**EXAMPLES OF GOOD EXTRACTION:**
Q: kochen →
A: gekocht

Q: Morgens macht er ein ______.
A: Frühstück

Q: Murat war in Bodrum. (Richtig/Falsch)
A: ✓

Now process the two exam page images provided. Look carefully at every handwritten mark, word, or checkmark.
`;

    const MODEL_NAME = 'models/gemini-2.5-flash'; // or gemini-3.1-flash-lite-preview

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
            temperature: 0.4,  // a bit more creative to interpret handwriting
            maxOutputTokens: 4096,
            topP: 0.95
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

        const extractedText = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!extractedText) {
            return res.status(500).json({ error: 'Empty response from Gemini' });
        }

        return res.status(200).json({ extractedText });
    } catch (error) {
        console.error('Server error:', error);
        return res.status(500).json({ error: 'Internal server error: ' + error.message });
    }
}
