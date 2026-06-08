// api/gemini.js
export default async function handler(req, res) {
    // Only allow POST requests
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { page1, page2 } = req.body;
    if (!page1 || !page2) {
        return res.status(400).json({ error: 'Both page images are required' });
    }

    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    if (!GEMINI_API_KEY) {
        console.error('Missing GEMINI_API_KEY environment variable');
        return res.status(500).json({ error: 'Server configuration error: missing API key' });
    }

    // Extract base64 data (remove the "data:image/jpeg;base64," prefix)
    const base64Page1 = page1.split(',')[1];
    const base64Page2 = page2.split(',')[1];

    // The prompt that forces only questions and answers extraction
    const prompt = `
You are an AI assistant specialized in extracting exam content.
Look at the two exam page images provided. 
Extract **only the questions and their corresponding answers** from these pages.
- Ignore any headers, footers, page numbers, instructions like "Please answer all questions" or "Total marks".
- Ignore any teacher's notes or extraneous text.
- If a question has multiple parts (a, b, c), include them.
- If a question has no answer written, write "Answer missing".
- Output in a clean, readable format, for example:
    Question 1: [text of question]
    Answer 1: [text of answer]
    Question 2: ...
- Do not include any additional commentary, explanations, or meta-commentary.
`;

    // Use a model that exists in your list: gemini-2.0-flash-lite (fast, stable, free)
    const MODEL_NAME = 'models/gemini-2.0-flash-lite';

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
            temperature: 0.2,   // low temperature = more deterministic, factual
            maxOutputTokens: 2048,
            topP: 0.95,
            topK: 40
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
            console.error('Gemini API error details:', JSON.stringify(data, null, 2));
            const errorMessage = data.error?.message || 'Unknown error from Gemini API';
            return res.status(response.status).json({ error: `Gemini API error: ${errorMessage}` });
        }

        // Extract the generated text
        const extractedText = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!extractedText) {
            console.error('Unexpected Gemini response structure:', JSON.stringify(data, null, 2));
            return res.status(500).json({ error: 'Gemini returned an empty or unexpected response' });
        }

        return res.status(200).json({ extractedText });
    } catch (error) {
        console.error('Server error calling Gemini:', error);
        return res.status(500).json({ error: 'Internal server error: ' + error.message });
    }
}
