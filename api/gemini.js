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
                        text: `You are an AI exam solver. Given the images of an exam, your task is to provide the correct answers to the questions.

Identify each question and the area where the student was supposed to write the answer. Provide the correct answer next to the corresponding question.

Output the questions and answers in a clear, numbered list. If it's a multiple-choice, fill-in-the-blank, true/false, or open-ended question, provide the correct answer as concisely as possible. For true/false, answer with "Richtig" or "Falsch".

Directly provide the solved exam. Be complete and accurate.`
                    },
                    {
                        type: 'image_url',
                        image_url: { url: page1 }   // page1 is already a data URL
                    },
                    {
                        type: 'image_url',
                        image_url: { url: page2 }   // page2 is already a data URL
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

        const extractedText = data.choices?.[0]?.message?.content;
        if (!extractedText) {
            console.error('Unexpected Groq response structure:', JSON.stringify(data, null, 2));
            return res.status(500).json({ error: 'Groq returned an empty or unexpected response' });
        }

        return res.status(200).json({ extractedText });
    } catch (error) {
        console.error('Server error calling Groq:', error);
        return res.status(500).json({ error: 'Internal server error: ' + error.message });
    }
}
