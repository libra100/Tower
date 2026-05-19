import express from 'express';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

const app = express();
const port = 3001;

app.use(express.json());

// 範例：Gemini AI 聊天端點
app.post('/api/gemini/chat', async (req, res) => {
  const { message } = req.body;
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: 'GEMINI_API_KEY is not configured on the server.' });
  }

  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'Message is required and must be a string.' });
  }

  try {
    const genAI = new GoogleGenAI({ apiKey });

    // 這裡僅作為架構範例，實際調用可依需求擴充
    // const result = await model.generateContent(message);
    // const response = await result.response;
    // const text = response.text();

    res.json({
      message: "Server received your message. Gemini integration is ready.",
      echo: message,
      status: "Configuration valid"
    });
  } catch (error: any) {
    console.error('Error with Gemini API:', error);
    res.status(500).json({ error: 'Failed to communicate with Gemini API.' });
  }
});

app.listen(port, () => {
  console.log(`Backend server running at http://localhost:${port}`);
});
