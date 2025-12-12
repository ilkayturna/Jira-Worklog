// ===================================================================
// VERCEL SERVERLESS FUNCTION: AI API PROXY
// Purpose: Secure proxy for Groq/OpenAI/Gemini API calls
// Security: API keys stored in environment variables
// ===================================================================

type VercelRequest = {
  method?: string;
  body?: unknown;
  headers?: Record<string, string | string[] | undefined>;
};

type VercelResponse = {
  status: (code: number) => VercelResponse;
  json: (body: unknown) => void;
  setHeader?: (name: string, value: string) => void;
};

// Type definitions
interface AIRequest {
  prompt: string;
  maxTokens?: number;
  temperature?: number;
  model?: string;
  provider?: 'groq' | 'openai' | 'gemini';
}

interface AIResponse {
  text: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

// CORS headers for security
const corsHeaders = {
  'Access-Control-Allow-Origin': '*', // In production, set to your domain
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// Main handler
export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  // Handle preflight
  if (req.method === 'OPTIONS') {
    res.status(200).json({});
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const body = (req.body ?? {}) as Partial<AIRequest>;

    // Validation
    if (typeof body.prompt !== 'string' || body.prompt.trim().length === 0) {
      res.status(400).json({ error: 'Invalid prompt' });
      return;
    }

    const request: AIRequest = {
      prompt: body.prompt,
      maxTokens: body.maxTokens,
      temperature: body.temperature,
      model: body.model,
      provider: body.provider,
    };

    // Get API keys from environment
    const GROQ_API_KEY = process.env.GROQ_API_KEY;
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

    const provider = request.provider || 'groq';
    
    let response: AIResponse;

    switch (provider) {
      case 'groq':
        if (!GROQ_API_KEY) {
          res.status(500).json({ error: 'Groq API key not configured' });
          return;
        }
        response = await callGroq(request, GROQ_API_KEY);
        break;

      case 'openai':
        if (!OPENAI_API_KEY) {
          res.status(500).json({ error: 'OpenAI API key not configured' });
          return;
        }
        response = await callOpenAI(request, OPENAI_API_KEY);
        break;

      case 'gemini':
        if (!GEMINI_API_KEY) {
          res.status(500).json({ error: 'Gemini API key not configured' });
          return;
        }
        response = await callGemini(request, GEMINI_API_KEY);
        break;

      default:
        res.status(400).json({ error: 'Invalid provider' });
        return;
    }

    // Return success
    res.status(200).json(response);
    return;
  } catch (error: any) {
    console.error('AI API Error:', error);
    res.status(500).json({ 
      error: error.message || 'Internal server error',
      details: error.toString()
    });
    return;
  }
}

// ===================================================================
// GROQ API CALL
// ===================================================================
async function callGroq(request: AIRequest, apiKey: string): Promise<AIResponse> {
  const model = request.model || 'llama-3.3-70b-versatile';
  
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: 'system',
          content: 'You are a professional assistant that follows instructions precisely.'
        },
        {
          role: 'user',
          content: request.prompt
        }
      ],
      max_tokens: request.maxTokens || 1000,
      temperature: request.temperature || 0.3,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Groq API Error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  
  return {
    text: data.choices[0]?.message?.content || '',
    usage: {
      promptTokens: data.usage?.prompt_tokens || 0,
      completionTokens: data.usage?.completion_tokens || 0,
      totalTokens: data.usage?.total_tokens || 0,
    }
  };
}

// ===================================================================
// OPENAI API CALL
// ===================================================================
async function callOpenAI(request: AIRequest, apiKey: string): Promise<AIResponse> {
  const model = request.model || 'gpt-4o-mini';
  
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: 'system',
          content: 'You are a professional assistant that follows instructions precisely.'
        },
        {
          role: 'user',
          content: request.prompt
        }
      ],
      max_tokens: request.maxTokens || 1000,
      temperature: request.temperature || 0.3,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI API Error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  
  return {
    text: data.choices[0]?.message?.content || '',
    usage: {
      promptTokens: data.usage?.prompt_tokens || 0,
      completionTokens: data.usage?.completion_tokens || 0,
      totalTokens: data.usage?.total_tokens || 0,
    }
  };
}

// ===================================================================
// GEMINI API CALL
// ===================================================================
async function callGemini(request: AIRequest, apiKey: string): Promise<AIResponse> {
  const model = request.model || 'gemini-pro';
  
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: request.prompt
              }
            ]
          }
        ],
        generationConfig: {
          temperature: request.temperature || 0.3,
          maxOutputTokens: request.maxTokens || 1000,
        }
      }),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Gemini API Error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  
  return {
    text,
    usage: {
      promptTokens: 0, // Gemini doesn't provide token counts in same format
      completionTokens: 0,
      totalTokens: 0,
    }
  };
}
