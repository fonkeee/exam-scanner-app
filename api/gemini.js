// api/gemini.js
export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { page1, page2 } = req.body;
    if (!page1 || !page2) {
        return res.status(400).json({ error: 'Both page images are required' });
    }

    // Your new Groq API key from Step 1
    const GROQ_API_KEY = process.env.GROQ_API_KEY;
    if (!GROQ_API_KEY) {
        console.error('Missing GROQ_API_KEY');
        return res.status(500).json({ error: 'Missing Groq API key' });
    }

    // --- Helper function to convert base64 to URL
    function createImageUrlFromBase64(base64String) {
        // base64String comes in format 'data:image/jpeg;base64,xxxxx'
        // We need just the data part for a Blob
        const mimeMatch = base64String.match(/data:([a-zA-Z0-9/;]+),/);
        const mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg';
        const base64Data = base64String.split(',')[1];
        const byteCharacters = atob(base64Data);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: mimeType });
        return URL.createObjectURL(blob);
    }

    // Define the Groq model (we'll use the recommended Llama 4 Scout)
    const GROQ_MODEL = 'meta-llama/llama-4-scout-17b-16e-instruct';
    const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';

    // --- Create URLs for your images
    const image1Url = createImageUrlFromBase64(page1);
    const image2Url = createImageUrlFromBase64(page2);

    // --- Build the request body for Groq
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
                        image_url: { url: image1Url }
                    },
                    {
                        type: 'image_url',
                        image_url: { url: image2Url }
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

        // Clean up blob URLs to avoid memory leaks
        URL.revokeObjectURL(image1Url);
        URL.revokeObjectURL(image2Url);

        return res.status(200).json({ extractedText });
    } catch (error) {
        console.error('Server error calling Groq:', error);
        return res.status(500).json({ error: 'Internal server error: ' + error.message });
    }
}
