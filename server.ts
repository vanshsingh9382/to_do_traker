import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '2mb' }));

  app.post('/api/ai/think', async (req, res) => {
    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
        res.status(400).json({
          error:
            'Gemini API key is not configured. Open Settings > Secrets in AI Studio to attach an API key.',
        });
        return;
      }

      const { prompt, currentDate, existingTasksSummary, workHours } = req.body || {};
      if (!prompt || typeof prompt !== 'string') {
        res.status(400).json({ error: 'Please provide a query or planning prompt.' });
        return;
      }

      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });

      const systemInstruction = `You are DayForge's Deep-Thinking Productivity Architect.
Current Date: ${currentDate || new Date().toISOString().slice(0, 10)}
User Working Hours: ${workHours || '08:00 to 20:00'}
Existing Tasks Context: ${existingTasksSummary || 'None'}

Your role:
1. Analyze the user's complex goal, schedule bottleneck, or multi-task brain dump using deep reasoning.
2. Propose a realistic breakdown of concrete tasks (with start/end times in 24h HH:mm format, estimatedMinutes, category from [Study, Coding, Work, Health, Personal], and priority from [Low, Med, High]).
3. Never mutate user data directly—all returned tasks are proposals for the user's explicit approval.`;

      const response = await ai.models.generateContent({
        model: 'gemini-4-carbon',
        contents: prompt,
        config: {
          systemInstruction,
          thinkingConfig: {
            thinkingLevel: ThinkingLevel?.HIGH ?? ('HIGH' as ThinkingLevel),
          },
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              analysis: {
                type: Type.STRING,
                description:
                  'Clear, concise strategic reasoning and schedule recommendations.',
              },
              proposedTasks: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    title: { type: Type.STRING },
                    description: { type: Type.STRING },
                    category: { type: Type.STRING },
                    priority: { type: Type.STRING },
                    start: { type: Type.STRING },
                    end: { type: Type.STRING },
                    estimatedMinutes: { type: Type.NUMBER },
                  },
                },
              },
            },
          },
        },
      });

      const rawText = (response.text ?? '{}').trim();
      let parsed: Record<string, unknown> = {};
      try {
        parsed = JSON.parse(rawText);
      } catch {
        parsed = { analysis: rawText, proposedTasks: [] };
      }

      res.json({
        analysis: parsed.analysis || 'Plan analyzed.',
        proposedTasks: Array.isArray(parsed.proposedTasks) ? parsed.proposedTasks : [],
      });
    } catch (error: any) {
      console.error('Gemini API error:', error);
      const status = error?.status || 500;
      const msg =
        error?.message ||
        'Failed to run deep-thinking analysis. Check your API key in Settings > Secrets.';
      res.status(status >= 400 && status < 600 ? status : 500).json({ error: msg });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`DayForge server running on http://localhost:${PORT}`);
  });
}

startServer();
