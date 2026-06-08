// api/gemini.js – OpenRouter integration
export default async function handler(req, res) {
    // Only accept POST requests
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { page1, page2 } = req.body;
    if (!page1 || !page2) {
        return res.status(400).json({ error: 'Both page images are required' });
    }

    // Get your OpenRouter API key from environment variables
    const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
    if (!OPENROUTER_API_KEY) {
        console.error('Missing OPENROUTER_API_KEY environment variable');
        return res.status(500).json({ error: 'Missing OpenRouter API key' });
    }

    // Choose a model – these are free or have free tiers
    // Options: 'deepseek/deepseek-r1' (great reasoning, free)
    //          'openai/gpt-4o-mini' (good all-around, free tier)
    //          'google/gemini-2.5-flash-preview' (free)
    //          'mistralai/mistral-large-latest' (free tier)
    const MODEL_NAME = 'deepseek/deepseek-r1'; // change as needed

    // The exam-solving prompt – strict, clean output
    const prompt = `You are an expert German language examiner. The user provides two images of an exam. Your task is to answer every question correctly.

**STRICT RULES – FOLLOW EXACTLY:**

1. **Copy the question text EXACTLY as printed**, including:
   - Numbers (2., 3., 4., 6.)
   - Letters (a., b., c.)
   - Punctuation (colons, periods, blank lines like "_____")
   - True/false statements: copy them word‑for‑word. Do NOT change any word (e.g., do not replace "Bodrum" with "Istanbul").
   - Fill‑in‑the‑blanks: keep the blank as "_____" or "______________".

2. On the next line write "A: " followed by the correct answer.

3. **Answer formats:**
   - Imperative (Sie‑form): Use "Geben Sie", "Schälen Sie", etc. For "dazugeben", the answer is "Geben Sie die Zwiebeln dazu."
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

**Now process the two exam page images. Output only the questions and answers – nothing else.**`;

    // OpenRouter API endpoint
    const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

    // Build the request body – images are already data URLs
    const requestBody = {
        model: MODEL_NAME,
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
        temperature: 0.0,  // lowest for deterministic answers
        top_p: 0.9
    };

    try {
        const response = await fetch(OPENROUTER_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
                'Content-Type': 'application/json',
                // Optional: identify your app (helps OpenRouter)
                'HTTP-Referer': process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://exam-scanner.vercel.app',
                'X-Title': 'Exam Scanner Pro'
            },
            body: JSON.stringify(requestBody)
        });

        const data = await response.json();

        if (!response.ok) {
            console.error('OpenRouter API error:', data);
            const errorMessage = data.error?.message || data.error || 'Unknown OpenRouter error';
            return res.status(response.status).json({ error: `OpenRouter error: ${errorMessage}` });
        }

        // Extract the generated text
        const extractedText = data.choices?.[0]?.message?.content;
        if (!extractedText) {
            console.error('Unexpected OpenRouter response structure:', JSON.stringify(data, null, 2));
            return res.status(500).json({ error: 'OpenRouter returned an empty or unexpected response' });
        }

        // Clean up any leftover markdown
        const cleanedText = extractedText.replace(/```/g, '').trim();

        return res.status(200).json({ extractedText: cleanedText });
    } catch (error) {
        console.error('Server error calling OpenRouter:', error);
        return res.status(500).json({ error: 'Internal server error: ' + error.message });
    }
}
