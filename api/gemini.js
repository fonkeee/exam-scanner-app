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

    const requestBody = {
        model: GROQ_MODEL,
        messages: [
            {
                role: 'user',
                content: [
                    {
                        type: 'text',
                        text: `You are an AI exam solver. Given the images of an exam, provide the correct answers for all questions.

CRITICAL FORMATTING INSTRUCTIONS:
- DO NOT use any markdown formatting like **bold**, *italic*, ### headings, or any other symbols.
- DO NOT use asterisks (*), hashes (#), dashes (-), or backticks.
- Output each question and its answer on its own line in plain text.
- For each question, write exactly: "Q: [question text]" then on the next line "A: [correct answer]".
- Separate each Q/A pair with a blank line.
- Keep the output as clean plain text without any extra commentary.

EXAMPLE:
Q: Murat war in Bodrum.
A: Richtig

Q: Er war allein dort.
A: Falsch

Now solve the exam from the provided images and output exactly in the format above.`
                    },
                    {
                        type: 'image_url',
                        image_url: { url: page1 }
                    },
                    {
                        type: 'image_url',
                        image_url: { url: page2 }
                    }
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

        let extractedText = data.choices?.[0]?.message?.content || '';
        // Remove any remaining markdown artifacts (just in case)
        extractedText = extractedText.replace(/\*\*/g, '').replace(/#{1,6}\s*/g, '').replace(/`/g, '');
        return res.status(200).json({ extractedText });
    } catch (error) {
        console.error('Server error calling Groq:', error);
        return res.status(500).json({ error: 'Internal server error: ' + error.message });
    }
}
