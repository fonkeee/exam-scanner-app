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

    // Extract base64
    const base64Page1 = page1.split(',')[1];
    const base64Page2 = page2.split(',')[1];

    // Smarter prompt – understands handwriting, implicit answers, and infers missing info
    const prompt = `
You are an expert exam grader. Look at the two exam page images. Extract every question and the student's answer.

RULES:
- Questions may be numbered (1., 2., etc.) or unnumbered.
- Answers may be written:
  * Directly after the question on the same line.
  * Below the question (handwritten or typed).
  * In a separate answer area or blank space.
  * Sometimes partially written or abbreviated – do your best to interpret.
- If an answer is clearly missing (blank), write "[No answer given]".
- DO NOT say "Answer missing" unless the space is completely blank and there's no attempt.
- If the answer is implicit (e.g., a circled option or a checkmark), describe it, e.g., "Circled option B".
- Output format: For each question, show "Q: [question text]" then "A: [answer text]". Separate pairs with blank lines.

Be thorough. If a question has sub-questions (a, b, c), list them as Q1a, Q1b, etc.

EXAMPLE OUTPUT:
Q: What is the capital of France?
A: Paris

Q: Solve for x: 2x + 3 = 7
A: x = 2

Now process the two provided exam page images.
`;

    const MODEL_NAME = 'models/gemini-2.5-flash'; // or any working model

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
            temperature: 0.3,  // slightly higher to allow interpretation
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
