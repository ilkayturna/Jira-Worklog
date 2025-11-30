
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
    // Gelen istekteki body ve headerları al (Authorization hariç, onu manuel ekleyeceğiz)
    const options = {
      method: req.method,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    };

    // Frontend'den gelen Authorization header'ını proxy isteğine ekle
    if (req.headers.authorization) {
      options.headers['Authorization'] = req.headers.authorization;
    }

    if (req.body && Object.keys(req.body).length > 0) {
      options.body = JSON.stringify(req.body);
    }

    // Jira'ya veya Groq'a asıl isteği yap
    const response = await fetch(url, options);
    
    // Yanıtı parse et
    let data;
    const contentType = response.headers.get("content-type");
    if (contentType && contentType.indexOf("application/json") !== -1) {
       data = await response.json();
    } else {
       data = await response.text();
    }

    // Durum kodunu ve veriyi geri döndür
    res.status(response.status).json(data);

  } catch (error) {
    console.error('Proxy Hatası:', error);
    res.status(500).json({ error: error.message });
  }
}
