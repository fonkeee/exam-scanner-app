// api/gemini.js - Ultra strict version
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

**ABSOLUTE RULES – VIOLATION WILL BE REJECTED:**

1. **Copy every question EXACTLY as it appears in the image.** Do NOT change any word, number, letter, or punctuation.
   - If the printed text says "die Zwiebeln dazugeben", you must write "die Zwiebeln dazugeben". Do NOT change it to "schälen".
   - If the printed text says "Murat war in Bodrum.", you must write "Murat war in Bodrum." Do NOT change it to "Istanbul".

2. **For each question, write the correct answer on the next line starting with "A: ".**

3. **Answer formats:**
   - Imperative (Sie-form): For "dazugeben", write "Geben Sie die Zwiebeln dazu."
   - Perfect tense: Use past participles (gekocht, gebacken, geschnitten, getrunken, gegessen).
   - True/false: Write exactly "Richtig" or "Falsch".
   - Fill-in-the-blanks: Insert the correct word from the given list.

4. **Do NOT add any extra text, explanations, or markdown. Do NOT reorder questions.**

5. Separate each Q/A pair with exactly one blank line.

**EXAMPLES OF CORRECT OUTPUT:**
2. Schreiben Sie die Sätze in der Imperativ-Sie-Form auf.
a. die Zwiebeln dazugeben
A: Geben Sie die Zwiebeln dazu.

b. die Kartoffeln schälen
A: Schälen Sie die Kartoffeln.

Murat war in Bodrum.
A: Richtig

**EXAMPLES OF INCORRECT OUTPUT (DO NOT DO THIS):**
Murat war in Istanbul.   (WRONG – changed city)
a. die Zwiebeln schälen   (WRONG – changed verb)

Now process the two exam page images. Follow the format exactly. I will check your output for exact matches.`;

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
        temperature: 0.0,  // Zero temperature for maximum determinism
        top_p: 0.9
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

        extractedText = extractedText.replace(/```/g, '').trim();
        return res.status(200).json({ extractedText });
    } catch (error) {
        console.error('Server error:', error);
        return res.status(500).json({ error: 'Internal server error: ' + error.message });
    }
}
