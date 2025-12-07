
import { AppSettings, Worklog, JiraIssue } from '../types';
import { plainTextToADF, parseJiraComment, secondsToHours } from '../utils/adf';

// --- UTILS ---

const getAuthHeader = (email: string, token: string) => {
  // Basic Auth: email:token formatında, encode YAPMADAN
  return 'Basic ' + btoa(email + ':' + token);
};

const normalizeUrl = (url: string) => {
    let normalized = url.trim().replace(/\/$/, '');
    if (normalized && !normalized.startsWith('http')) {
        normalized = `https://${normalized}`;
    }
    return normalized;
}

// ARTIK PROXY ÜZERİNDEN İSTEK ATIYORUZ
const fetchThroughProxy = async (targetUrl: string, method: string, headers: any, body?: any, retries = 3, backoff = 1000) => {
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

    for (let i = 0; i < retries; i++) {
        try {
            const response = await fetch(proxyUrl, options);
            
            // 429 (Too Many Requests) veya 5xx hatalarında retry yap
            if (response.status === 429 || response.status >= 500) {
                throw new Error(`Retryable error: ${response.status}`);
            }
            
            return response;
        } catch (error) {
            if (i === retries - 1) throw error;
            // Exponential backoff
            await new Promise(resolve => setTimeout(resolve, backoff * Math.pow(2, i)));
        }
    }
    throw new Error("Max retries reached");
};

// --- JIRA API ---

export const fetchWorklogs = async (date: string, settings: AppSettings): Promise<Worklog[]> => {
  if (!settings.jiraUrl || !settings.jiraEmail || !settings.jiraToken) {
    throw new Error("Jira Bilgileri Eksik: Ayarları kontrol edin.");
  }

  // worklogDate ile o güne ait worklog'u olan issue'ları bul, worklogAuthor ile filtrele
  const jql = `worklogDate = "${date}" AND worklogAuthor = currentUser()`;
  
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
  // Yeni /search/jql endpoint'i issues array döner
  const issues = data.issues || [];
  
  if (!issues) return [];

  const allWorklogs: Worklog[] = [];

  // Paralel istekleri sınırla veya hepsini gönder (Vercel serverless olduğu için hepsini göndermek genelde ok)
  const promises = issues.map(async (issue: any) => {
    try {
      let logs = [];
      
      // OPTIMIZATION: Check if worklogs are already fully included in the search response
      const worklogField = issue.fields?.worklog;
      if (worklogField && worklogField.worklogs && worklogField.total <= worklogField.maxResults) {
          logs = worklogField.worklogs;
      } else {
          // If not all worklogs are present (or field is missing), fetch them separately
          const wlTargetUrl = `${normalizeUrl(settings.jiraUrl)}/rest/api/3/issue/${issue.key}/worklog`;
          const wlResponse = await fetchThroughProxy(wlTargetUrl, 'GET', {
                'Authorization': getAuthHeader(settings.jiraEmail, settings.jiraToken),
                'Accept': 'application/json'
          });
          
          if (!wlResponse.ok) return;
          
          const wlData = await wlResponse.json();
          logs = wlData.worklogs || (typeof wlData === 'string' ? JSON.parse(wlData).worklogs : []);
      }

      logs.forEach((wl: any) => {
         const wlStartedDate = wl.started.split('T')[0];
         // Sadece o güne ait ve bana ait olanları al
         const authorEmail = wl.author?.emailAddress?.toLowerCase();
         const userEmail = settings.jiraEmail.toLowerCase();
         // Check both email and accountId/displayName as fallback
         const isMe = authorEmail === userEmail || 
                      (wl.author?.accountId === issue.fields?.assignee?.accountId) || // simplistic fallback
                      true; // We filter by JQL 'currentUser()', so mostly these are ours, but let's be strict with email if available

         // Re-verify author strictly if email is available
         const isReallyMe = authorEmail ? authorEmail === userEmail : true;
         
         if (wlStartedDate === date && isReallyMe) {
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

// Tüm hafta için worklog'ları tek bir sorgu ile çek (OPTIMIZED)
export const fetchWeekWorklogs = async (mondayDateStr: string, settings: AppSettings): Promise<Map<string, Worklog[]>> => {
  if (!settings.jiraUrl || !settings.jiraEmail || !settings.jiraToken) {
    throw new Error("Jira Bilgileri Eksik: Ayarları kontrol edin.");
  }

  const monday = new Date(mondayDateStr);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  
  const startDate = mondayDateStr;
  const endDate = `${sunday.getFullYear()}-${String(sunday.getMonth() + 1).padStart(2, '0')}-${String(sunday.getDate()).padStart(2, '0')}`;

  // Tek bir JQL sorgusu ile tüm haftayı çek
  const jql = `worklogDate >= "${startDate}" AND worklogDate <= "${endDate}" AND worklogAuthor = currentUser()`;
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
          maxResults: 100 // Haftalık çok fazla issue olabilir, gerekirse sayfalama yapılmalı ama şimdilik 100 yeterli
      });
  } catch (error) {
      console.error("Haftalık veri çekme hatası:", error);
      return new Map();
  }

  if (!response.ok) return new Map();

  const data = await response.json();
  const issues = data.issues || [];
  const weekMap = new Map<string, Worklog[]>();

  // Initialize map for all days
  for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      weekMap.set(dateStr, []);
  }

  const promises = issues.map(async (issue: any) => {
      try {
          let logs = [];
          const worklogField = issue.fields?.worklog;
          
          // Optimization: Use embedded worklogs if complete
          if (worklogField && worklogField.worklogs && worklogField.total <= worklogField.maxResults) {
              logs = worklogField.worklogs;
          } else {
              // Fetch separately if needed
              const wlTargetUrl = `${normalizeUrl(settings.jiraUrl)}/rest/api/3/issue/${issue.key}/worklog`;
              const wlResponse = await fetchThroughProxy(wlTargetUrl, 'GET', {
                  'Authorization': getAuthHeader(settings.jiraEmail, settings.jiraToken),
                  'Accept': 'application/json'
              });
              if (wlResponse.ok) {
                  const wlData = await wlResponse.json();
                  logs = wlData.worklogs || [];
              }
          }

          logs.forEach((wl: any) => {
              const wlStartedDate = wl.started.split('T')[0];
              const authorEmail = wl.author?.emailAddress?.toLowerCase();
              const userEmail = settings.jiraEmail.toLowerCase();
              const isReallyMe = authorEmail ? authorEmail === userEmail : true;

              // Check if date is within our week range
              if (weekMap.has(wlStartedDate) && isReallyMe) {
                  const currentLogs = weekMap.get(wlStartedDate) || [];
                  currentLogs.push({
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
                  weekMap.set(wlStartedDate, currentLogs);
              }
          });
      } catch (e) {
          console.error(`Issue detay hatası (${issue.key}):`, e);
      }
  });

  await Promise.all(promises);
  return weekMap;
};

export const updateWorklog = async (wl: Worklog, settings: AppSettings, newComment?: string, newSeconds?: number, newDate?: string) => {
    const body: any = {
        started: newDate ? `${newDate}T09:00:00.000+0000` : wl.started,
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
    return await response.json();
}

// Issue'ları sil (undo için)
export const deleteWorklog = async (issueKey: string, worklogId: string, settings: AppSettings) => {
    const targetUrl = `${normalizeUrl(settings.jiraUrl)}/rest/api/3/issue/${issueKey}/worklog/${worklogId}`;
    
    const response = await fetchThroughProxy(targetUrl, 'DELETE', {
        'Authorization': getAuthHeader(settings.jiraEmail, settings.jiraToken),
        'Accept': 'application/json'
    });

    if(!response.ok) throw new Error("Worklog silinemedi");
}

// Jira Issue Arama - Akıllı öneri ve yeni worklog eklemek için
export const searchIssues = async (query: string, settings: AppSettings): Promise<JiraIssue[]> => {
    if (!settings.jiraUrl || !settings.jiraEmail || !settings.jiraToken) {
        throw new Error("Jira Bilgileri Eksik");
    }

    if (!query || query.trim().length < 2) return [];

    // JQL: Issue key ile başlıyorsa direkt ara, değilse summary'de ara
    const isIssueKey = /^[A-Z]+-\d+$/i.test(query.trim());
    const jql = isIssueKey 
        ? `key = "${query.trim().toUpperCase()}"` 
        : `summary ~ "${query.trim()}*" OR key ~ "${query.trim().toUpperCase()}" ORDER BY updated DESC`;

    const targetUrl = `${normalizeUrl(settings.jiraUrl)}/rest/api/3/search/jql`;
    
    const response = await fetchThroughProxy(targetUrl, 'POST', {
        'Authorization': getAuthHeader(settings.jiraEmail, settings.jiraToken),
        'Accept': 'application/json',
        'Content-Type': 'application/json'
    }, {
        jql: jql,
        fields: ['summary', 'issuetype', 'status', 'project', 'description'],
        maxResults: 10
    });

    if (!response.ok) {
        return [];
    }

    const data = await response.json();
    const issues = data.issues || [];

    return issues.map((issue: any) => ({
        key: issue.key,
        summary: issue.fields?.summary || '',
        issueType: issue.fields?.issuetype?.name || '',
        status: issue.fields?.status?.name || '',
        projectName: issue.fields?.project?.name || '',
        description: parseJiraComment(issue.fields?.description) || ''
    }));
};

// Issue detaylarını çek (description dahil) - Haftalık rapor için
export const fetchIssueDetails = async (issueKey: string, settings: AppSettings): Promise<{ description: string; summary: string; projectName: string; status?: string; assignee?: string } | null> => {
    if (!settings.jiraUrl || !settings.jiraEmail || !settings.jiraToken) {
        return null;
    }

    try {
        const targetUrl = `${normalizeUrl(settings.jiraUrl)}/rest/api/3/issue/${issueKey}?fields=description,summary,project,status,assignee`;
        
        const response = await fetchThroughProxy(targetUrl, 'GET', {
            'Authorization': getAuthHeader(settings.jiraEmail, settings.jiraToken),
            'Accept': 'application/json'
        });

        if (!response.ok) return null;

        const data = await response.json();
        return {
            description: parseJiraComment(data.fields?.description) || '',
            summary: data.fields?.summary || '',
            projectName: data.fields?.project?.name || '',
            status: data.fields?.status?.name,
            assignee: data.fields?.assignee?.displayName
        };
    } catch (e) {
        console.error('Failed to fetch issue details:', e);
        return null;
    }
};

// Bana atanan issue'ları getir
export const fetchAssignedIssues = async (settings: AppSettings): Promise<JiraIssue[]> => {
    if (!settings.jiraUrl || !settings.jiraEmail || !settings.jiraToken) {
        throw new Error("Jira Bilgileri Eksik");
    }

    const jql = `assignee = currentUser() AND statusCategory != Done ORDER BY updated DESC`;
    const targetUrl = `${normalizeUrl(settings.jiraUrl)}/rest/api/3/search/jql`;
    
    const response = await fetchThroughProxy(targetUrl, 'POST', {
        'Authorization': getAuthHeader(settings.jiraEmail, settings.jiraToken),
        'Accept': 'application/json',
        'Content-Type': 'application/json'
    }, {
        jql: jql,
        fields: ['summary', 'issuetype', 'status', 'project', 'description'],
        maxResults: 20
    });

    if (!response.ok) return [];

    const data = await response.json();
    const issues = data.issues || [];

    return issues.map((issue: any) => ({
        key: issue.key,
        summary: issue.fields?.summary || '',
        issueType: issue.fields?.issuetype?.name || '',
        status: issue.fields?.status?.name || '',
        projectName: issue.fields?.project?.name || '',
        description: parseJiraComment(issue.fields?.description) || ''
    }));
};

// --- GROQ API (Proxy Üzerinden) ---

export const callGroq = async (prompt: string, settings: AppSettings, maxTokens = 300, temperature = 0.3): Promise<string> => {
    if (!settings.groqApiKey) throw new Error("Groq API Anahtarı eksik");

    const targetUrl = 'https://api.groq.com/openai/v1/chat/completions';
    
    const response = await fetchThroughProxy(targetUrl, 'POST', {
        'Authorization': `Bearer ${settings.groqApiKey}`,
        'Content-Type': 'application/json'
    }, {
        model: settings.groqModel || 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: maxTokens,
        temperature: temperature
    });

    if (!response.ok) {
        let errorMsg = `Groq API Hatası (${response.status})`;
        try {
            const errorData = await response.json();
            if (errorData.error?.message) {
                errorMsg += `: ${errorData.error.message}`;
            }
            if (errorData.error?.type === 'invalid_request_error' && errorData.error?.message?.includes('model')) {
                errorMsg += ' - Seçtiğiniz model kullanılamıyor veya hatalı. Lütfen başka bir model seçin.';
            }
        } catch (e) {
            // Ignore JSON parsing error
        }
        throw new Error(errorMsg);
    }
    
    const json = await response.json();
    const content = json.choices?.[0]?.message?.content || '';
    const finishReason = json.choices?.[0]?.finish_reason;
    
    // Eğer finish_reason "length" ise, metin token limit'ini aştı demek
    if (finishReason === 'length') {
        console.warn(`AI yanıt token limitine ulaştı. Verilen metin eksik olabilir.`);
    }
    
    return content;
};
