
import { AppSettings, Worklog } from '../types';
import { plainTextToADF, parseJiraComment, secondsToHours } from '../utils/adf';

// --- UTILS ---

const getAuthHeader = (email: string, token: string) => {
  // UTF-8 karakter desteği için encodeURIComponent
  return 'Basic ' + btoa(encodeURIComponent(email) + ':' + token);
};

const normalizeUrl = (url: string) => {
    let normalized = url.trim().replace(/\/$/, '');
    if (normalized && !normalized.startsWith('http')) {
        normalized = `https://${normalized}`;
    }
    return normalized;
}

// ARTIK PROXY ÜZERİNDEN İSTEK ATIYORUZ
const fetchThroughProxy = async (targetUrl: string, method: string, headers: any, body?: any) => {
    // Vercel'de çalışırken /api/proxy endpoint'ini kullan
    const proxyUrl = `/api/proxy?url=${encodeURIComponent(targetUrl)}`;
    
    const options: any = {
        method: method,
        headers: headers
    };

    if (body) {
        // DÜZELTME: Browser fetch API'si body'yi otomatik stringify YAPMAZ.
        // Eğer body bir obje ise ve content-type json ise, manuel stringify yapmalıyız.
        // Aksi takdirde sunucuya "[object Object]" gider ve 500 hatası alınır.
        if (typeof body === 'object') {
            options.body = JSON.stringify(body);
        } else {
            options.body = body;
        }
    }

    const response = await fetch(proxyUrl, options);
    return response;
};

// --- JIRA API ---

export const fetchWorklogs = async (date: string, settings: AppSettings): Promise<Worklog[]> => {
  if (!settings.jiraUrl || !settings.jiraEmail || !settings.jiraToken) {
    throw new Error("Jira Bilgileri Eksik: Ayarları kontrol edin.");
  }

  // Önce sadece worklogDate ile dene, sonra client-side filtrele
  const jql = `worklogDate = "${date}"`;
  
  // DEBUG: JQL sorgusunu konsola yazdır
  console.log('JQL Sorgusu:', jql);
  console.log('Seçili Tarih:', date);
  console.log('Kullanıcı Email:', settings.jiraEmail);
  
  // POST metodu ile yeni /search/jql endpoint'i kullan (eski /search endpoint'i 410 Gone döner)
  // Bkz: https://developer.atlassian.com/changelog/#CHANGE-2046
  const targetUrl = `${normalizeUrl(settings.jiraUrl)}/rest/api/3/search/jql`;
  
  let response;
  try {
      response = await fetchThroughProxy(targetUrl, 'POST', {
          'Authorization': getAuthHeader(settings.jiraEmail, settings.jiraToken),
          'Accept': 'application/json',
          'Content-Type': 'application/json'
      }, {
          jql: jql,
          fields: ['worklog', 'summary'],
          maxResults: 100
      });
  } catch (error) {
      throw new Error("Ağ Hatası: Proxy sunucusuna erişilemiyor.");
  }

  if (!response.ok) {
    let errDetail = '';
    try { 
        const json = await response.json();
        errDetail = JSON.stringify(json.details || json);
    } catch(e) {
        try { errDetail = await response.text(); } catch(z){}
    }
    throw new Error(`Jira API Hatası (${response.status}): ${errDetail}`);
  }

  const data = await response.json();
  // DEBUG: API yanıtını konsola yazdır
  console.log('API Yanıtı:', data);
  
  // Yeni /search/jql endpoint'i issues array döner, eski format ile uyumlu kontrol yap
  const issues = data.issues || [];
  
  if (!issues) return [];

  const allWorklogs: Worklog[] = [];

  // Paralel istekleri sınırla veya hepsini gönder (Vercel serverless olduğu için hepsini göndermek genelde ok)
  const promises = issues.map(async (issue: any) => {
    try {
      const wlTargetUrl = `${normalizeUrl(settings.jiraUrl)}/rest/api/3/issue/${issue.key}/worklog`;
      const wlResponse = await fetchThroughProxy(wlTargetUrl, 'GET', {
            'Authorization': getAuthHeader(settings.jiraEmail, settings.jiraToken),
            'Accept': 'application/json'
      });
      
      if (!wlResponse.ok) return;
      
      const wlData = await wlResponse.json();
      const logs = wlData.worklogs || (typeof wlData === 'string' ? JSON.parse(wlData).worklogs : []);

      logs.forEach((wl: any) => {
         const wlStartedDate = wl.started.split('T')[0];
         // Sadece o güne ait ve bana ait olanları al
         // (Not: Search JQL zaten currentUser ve date filtreliyor ama worklog endpoint'i tüm worklogları döner, filtre şart)
         const isMe = wl.author?.emailAddress === settings.jiraEmail || wl.author?.accountId;
         
         if (wlStartedDate === date && isMe) {
             allWorklogs.push({
                 id: wl.id,
                 issueKey: issue.key,
                 summary: issue.fields?.summary || '',
                 seconds: wl.timeSpentSeconds,
                 hours: secondsToHours(wl.timeSpentSeconds),
                 comment: parseJiraComment(wl.comment),
                 started: wl.started,
                 author: wl.author?.displayName,
                 originalADF: wl.comment 
             });
         }
      });
    } catch (e) {
        console.error(`Worklogları çekerken hata (${issue.key})`, e);
    }
  });

  await Promise.all(promises);
  return allWorklogs;
};

export const updateWorklog = async (wl: Worklog, settings: AppSettings, newComment?: string, newSeconds?: number) => {
    const body: any = {
        started: wl.started,
        timeSpentSeconds: newSeconds !== undefined ? newSeconds : wl.seconds
    };

    if (newComment !== undefined) {
        const adf = plainTextToADF(newComment);
        if (adf) body.comment = adf;
    } else if (wl.originalADF) {
        body.comment = wl.originalADF;
    }

    const targetUrl = `${normalizeUrl(settings.jiraUrl)}/rest/api/3/issue/${wl.issueKey}/worklog/${wl.id}`;
    
    const response = await fetchThroughProxy(targetUrl, 'PUT', {
        'Authorization': getAuthHeader(settings.jiraEmail, settings.jiraToken),
        'Accept': 'application/json',
        'Content-Type': 'application/json'
    }, body);

    if (!response.ok) {
        throw new Error(`Worklog güncellenemedi (${response.status})`);
    }
};

export const createWorklog = async (issueKey: string, dateStr: string, seconds: number, comment: string, settings: AppSettings) => {
    const started = `${dateStr}T09:00:00.000+0000`;
    
    const body = {
        timeSpentSeconds: seconds,
        started: started,
        comment: plainTextToADF(comment)
    };

    const targetUrl = `${normalizeUrl(settings.jiraUrl)}/rest/api/3/issue/${issueKey}/worklog`;
    
    const response = await fetchThroughProxy(targetUrl, 'POST', {
        'Authorization': getAuthHeader(settings.jiraEmail, settings.jiraToken),
        'Accept': 'application/json',
        'Content-Type': 'application/json'
    }, body);

    if(!response.ok) throw new Error("Worklog oluşturulamadı");
}

// --- GROQ API (Proxy Üzerinden) ---

export const callGroq = async (prompt: string, settings: AppSettings, maxTokens = 300): Promise<string> => {
    if (!settings.groqApiKey) throw new Error("Groq API Anahtarı eksik");

    const targetUrl = 'https://api.groq.com/openai/v1/chat/completions';
    
    const response = await fetchThroughProxy(targetUrl, 'POST', {
        'Authorization': `Bearer ${settings.groqApiKey}`,
        'Content-Type': 'application/json'
    }, {
        model: settings.groqModel || 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: maxTokens,
        temperature: 0.3
    });

    if (!response.ok) throw new Error("Yapay zeka servisi yanıt vermedi");
    const json = await response.json();
    return json.choices?.[0]?.message?.content || '';
};
