
import { AppSettings, Worklog } from '../types';
import { plainTextToADF, parseJiraComment, secondsToHours } from '../utils/adf';

// --- UTILS ---

const getAuthHeader = (email: string, token: string) => {
  return 'Basic ' + btoa(`${email}:${token}`);
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
        options.body = body; // JSON.stringify yapma, proxy.js halledecek veya caller obje vermeli
    }

    const response = await fetch(proxyUrl, options);
    return response;
};

// --- JIRA API ---

export const fetchWorklogs = async (date: string, settings: AppSettings): Promise<Worklog[]> => {
  if (!settings.jiraUrl || !settings.jiraEmail || !settings.jiraToken) {
    throw new Error("Jira Bilgileri Eksik: Ayarları kontrol edin.");
  }

  const jql = `worklogDate = "${date}" AND worklogAuthor = currentUser()`;
  
  // FIX: GET method deprecated (410 Gone). Switched to POST.
  // URL sonuna / koymuyoruz.
  const targetUrl = `${normalizeUrl(settings.jiraUrl)}/rest/api/3/search`;
  
  let response;
  try {
      // Body'yi obje olarak gönderiyoruz, fetchThroughProxy->fetch bunu JSON.stringify yapacak
      // Ancak fetchThroughProxy fonksiyonunu yukarıda düzelttik, burada manuel stringify yapmıyoruz,
      // çünkü browser fetch API'sine body obje verilmez, string verilir.
      // Düzeltme: Caller (burası) stringify yapsın.
      
      response = await fetchThroughProxy(targetUrl, 'POST', {
          'Authorization': getAuthHeader(settings.jiraEmail, settings.jiraToken),
          'Accept': 'application/json',
          'Content-Type': 'application/json'
      }, {
          jql: jql,
          fields: ['worklog', 'key', 'summary'],
          maxResults: 100,
          validateQuery: false // Sorgu doğrulamasını esnek tut
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
  const issues = data.issues || (typeof data === 'string' ? JSON.parse(data).issues : []);
  
  if (!issues) return [];

  const allWorklogs: Worklog[] = [];

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
         if (wlStartedDate === date) {
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
        console.error(`Failed to fetch worklogs for ${issue.key}`, e);
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
        throw new Error(`Failed to update worklog (${response.status})`);
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

    if(!response.ok) throw new Error("Failed to create worklog");
}

// --- GROQ API (Proxy Üzerinden) ---

export const callGroq = async (prompt: string, settings: AppSettings, maxTokens = 300): Promise<string> => {
    if (!settings.groqApiKey) throw new Error("Groq API Key missing");

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

    if (!response.ok) throw new Error("Groq API failed");
    const json = await response.json();
    return json.choices?.[0]?.message?.content || '';
};
