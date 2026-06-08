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

    const prompt = `You are an expert German examiner. The user provides two images of an exam. Your task is to answer every question correctly.

**STRICT RULES – FOLLOW EXACTLY:**

1. **Copy the question text EXACTLY as printed**, including:
   - Numbers (2., 3., 4., 6.)
   - Letters (a., b., c.)
   - Punctuation (colons, periods, blank lines like "_____")
   - True/false statements: copy them word‑for‑word. Do NOT change any word (e.g., do not replace "Bodrum" with "Istanbul").
   - Fill‑in‑the‑blanks: keep the blank as "_____" or "______________".

2. On the next line write "A: " followed by the correct answer.

3. **Answer formats:**
   - Imperative (Sie‑form): Use "Geben Sie", "Schälen Sie", etc.
   - Perfect tense: Provide the past participle (gekocht, gebacken, geschnitten, getrunken, gegessen).
   - True/false: Exactly "Richtig" or "Falsch".
   - Fill‑in‑the‑blanks: Insert the correct word from the provided list.

4. **Do NOT add extra text**, markdown, or commentary. Do NOT change the order of questions.

5. Separate each Q/A pair with exactly one blank line.

**EXAMPLE OF CORRECT TRUE/FALSE OUTPUT:**
Murat war in Bodrum.
A: Richtig

Er war allein dort.
A: Falsch

**EXAMPLE OF INCORRECT (DO NOT DO THIS):**
Murat war in Istanbul.
A: Falsch

**Now process the two exam page images. Follow the format exactly. Output only the questions and answers – nothing else.**`;

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
            return res.status(response.status).json({ error: data.error?.message || 'Groq API error' });
        }

        let extractedText = data.choices?.[0]?.message?.content;
        if (!extractedText) {
            return res.status(500).json({ error: 'Empty response from Groq' });
        }

        // Post‑process: remove any stray markdown or extra spaces
        extractedText = extractedText.replace(/```/g, '').trim();
        // Ensure there's a blank line between Q/A pairs (but keep original spacing)
        extractedText = extractedText.replace(/\n\n+/g, '\n\n');

        return res.status(200).json({ extractedText });
    } catch (error) {
        console.error('Server error:', error);
        return res.status(500).json({ error: 'Internal server error: ' + error.message });
    }
}
