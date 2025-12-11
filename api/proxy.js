
export default async function handler(req, res) {
  // CORS Başlıklarını ayarla
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const { url } = req.query;

  if (!url) {
    return res.status(400).json({ error: 'URL parameter is required' });
  }

  try {
    const options = {
      method: req.method,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    };

    // Authorization header'ını ilet
    if (req.headers.authorization) {
      options.headers['Authorization'] = req.headers.authorization;
    }

    // Body (Payload) aktarımı - Kritik düzeltme
    if (req.method !== 'GET' && req.method !== 'HEAD') {
        if (req.body) {
            // Vercel bazen body'yi obje olarak parse eder, bazen string bırakır.
            // Jira API'sine string olarak göndermeliyiz.
            options.body = typeof req.body === 'object' ? JSON.stringify(req.body) : req.body;
        }
    }

    // Jira'ya asıl isteği yap
    const response = await fetch(url, options);
    
    // Yanıtı parse et
    let data;
    const contentType = response.headers.get("content-type");
    if (contentType && contentType.includes("application/json")) {
       data = await response.json();
    } else {
       data = await response.text();
    }

    if (!response.ok) {
        // Enhanced error logging - NEVER use string concatenation with objects
        console.error('🔴 Jira API Error:', {
            status: response.status,
            statusText: response.statusText,
            url: url,
            method: req.method,
            responseData: typeof data === 'object' ? JSON.stringify(data, null, 2) : data
        });

        // Return structured error with full Jira response preserved
        return res.status(response.status).json({
            error: 'Jira API Error',
            status: response.status,
            statusText: response.statusText,
            details: data,
            // Also include flattened error messages for easier access
            errorMessages: data?.errorMessages || [],
            errors: data?.errors || {}
        });
    }

    // Başarılı yanıt
    res.status(response.status).json(data);

  } catch (error) {
    // CRITICAL: Never use string concatenation with error objects
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    
    console.error('🔴 Proxy Error:', {
        message: errorMessage,
        stack: errorStack,
        url: url,
        method: req.method
    });
    
    res.status(500).json({ 
        error: 'Proxy Error',
        message: errorMessage,
        details: errorStack 
    });
  }
}
