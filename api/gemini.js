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

**STRICT RULES:**
- Copy the question text **exactly** as it appears (including numbers, letters a./b./c., punctuation, and blank lines like "_____").
- On the next line write "A: " followed by the correct answer.
- Do NOT change the wording of the question. Do NOT add extra text like "Murat war in den Sommerferien in Istanbul" if the original says "Murat war in Bodrum."
- For true/false statements: output exactly "Richtig" or "Falsch".
- For imperative (Imperativ) with "Sie": use the formal "Sie" form. Examples:
    - "die Zwiebeln dazugeben" → "Geben Sie die Zwiebeln dazu."
    - "die Kartoffeln schälen" → "Schälen Sie die Kartoffeln."
- For perfect tense (Perfekt): output the past participle (e.g., "gekocht", "gebacken").
- For fill‑in‑the‑blanks: insert the correct word from the provided list.
- Preserve the original numbering and sub‑letters (a., b., etc.).
- Separate each question-answer pair with one blank line.
- No markdown, no extra commentary.

**EXAMPLE OUTPUT (true/false):**
Murat war in Bodrum.
A: Richtig

Er war allein dort.
A: Falsch

**EXAMPLE OUTPUT (imperative):**
a. die Zwiebeln dazugeben
A: Geben Sie die Zwiebeln dazu.

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
            return res.status(response.status).json({ error: data.error?.message || 'Groq API error' });
        }

        const extractedText = data.choices?.[0]?.message?.content;
        if (!extractedText) {
            return res.status(500).json({ error: 'Empty response from Groq' });
        }

        return res.status(200).json({ extractedText });
    } catch (error) {
        console.error('Server error:', error);
        return res.status(500).json({ error: 'Internal server error: ' + error.message });
    }
}
