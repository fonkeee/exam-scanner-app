// api/gemini.js
export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { page1, page2 } = req.body;
    if (!page1 || !page2) {
        return res.status(400).json({ error: 'Both page images are required' });
    }

    const GROQ_API_KEY = process.env.GROQ_API_KEY;
    if (!GROQ_API_KEY) {
        console.error('Missing GROQ_API_KEY');
        return res.status(500).json({ error: 'Missing Groq API key' });
    }

    const GROQ_MODEL = 'meta-llama/llama-4-scout-17b-16e-instruct';
    const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';

    const prompt = `You are an AI exam solver. Given the images of an exam, your task is to provide the correct answers in a **very specific clean format**.

**RULES:**
- For each question, repeat the question text exactly as printed (including numbers or letters like "a.", "b.", "1.", "2.").
- On the next line, write "A: " followed by the correct answer.
- Do NOT use any markdown (no asterisks, no hashtags, no bold).
- Do NOT add extra words like "Answer:" – just "A: ".
- Keep the original question numbering and sub-letters.
- For fill-in-the-blank, show the blank as "_____" in the question, then the filled word in the answer.
- For true/false, answer with "Richtig" or "Falsch".
- For verb conjugation, give the correct form.
- Separate each question-answer pair with a blank line.

**EXAMPLE OUTPUT:**
1. Was ist die Hauptstadt von Frankreich?
A: Paris

2. Ergänze: Morgens macht er ein _____.
A: Frühstück

3. Murat war in Bodrum. (Richtig/Falsch)
A: Richtig

Now process the two exam page images. Follow the format exactly.`;

    const requestBody = {
        model: GROQ_MODEL,
        messages: [
            {
                role: 'user',
                content: [
                    { type: 'text', text: prompt },
                    { type: 'image_url', image_url: { url: page1 } },
                    { type: 'image_url', image_url: { url: page2 } }
                ]
            }
        ],
        max_tokens: 4096,
        temperature: 0.1
    };

    try {
        const response = await fetch(GROQ_API_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${GROQ_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody)
        });

        const data = await response.json();

        if (!response.ok) {
            console.error('Groq API error:', data);
            const errorMessage = data.error?.message || 'Unknown error from Groq API';
            return res.status(response.status).json({ error: `Groq API error: ${errorMessage}` });
        }

        const extractedText = data.choices?.[0]?.message?.content;
        if (!extractedText) {
            return res.status(500).json({ error: 'Empty response from Groq' });
        }

        return res.status(200).json({ extractedText });
    } catch (error) {
        console.error('Server error calling Groq:', error);
        return res.status(500).json({ error: 'Internal server error: ' + error.message });
    }
}
