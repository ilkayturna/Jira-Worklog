
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

const buildUrl = (jiraUrl: string, endpoint: string) => {
    const normalizedJira = normalizeUrl(jiraUrl);
    return `${normalizedJira}${endpoint}`;
};

// --- JIRA API ---

export const fetchWorklogs = async (date: string, settings: AppSettings): Promise<Worklog[]> => {
  if (!settings.jiraUrl || !settings.jiraEmail || !settings.jiraToken) {
    throw new Error("Missing Jira Credentials: Check Settings");
  }

  const jql = `worklogDate = "${date}" AND worklogAuthor = currentUser()`;
  const requestUrl = buildUrl(settings.jiraUrl, `/rest/api/3/search?jql=${encodeURIComponent(jql)}&fields=worklog,key,summary&maxResults=100`);
  
  let response;
  try {
      response = await fetch(requestUrl, {
        method: 'GET',
        headers: {
          'Authorization': getAuthHeader(settings.jiraEmail, settings.jiraToken),
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        }
      });
  } catch (error) {
      // Pass the raw network error (likely CORS or Offline)
      throw new Error("Network Request Failed. Check URL or Internet connection.");
  }

  if (!response.ok) {
    let errText = '';
    try { errText = await response.text(); } catch(e) {}
    throw new Error(`Jira API Error (${response.status}): ${errText || response.statusText}`);
  }

  const data = await response.json();
  const allWorklogs: Worklog[] = [];

  const promises = data.issues.map(async (issue: any) => {
    try {
      const wlRequestUrl = buildUrl(settings.jiraUrl, `/rest/api/3/issue/${issue.key}/worklog`);
      const wlResponse = await fetch(wlRequestUrl, {
         headers: {
            'Authorization': getAuthHeader(settings.jiraEmail, settings.jiraToken),
            'Accept': 'application/json'
         }
      });
      
      if (!wlResponse.ok) return;
      
      const wlData = await wlResponse.json();
      wlData.worklogs.forEach((wl: any) => {
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

    const requestUrl = buildUrl(settings.jiraUrl, `/rest/api/3/issue/${wl.issueKey}/worklog/${wl.id}`);
    const response = await fetch(requestUrl, {
        method: 'PUT',
        headers: {
            'Authorization': getAuthHeader(settings.jiraEmail, settings.jiraToken),
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
    });

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

    const requestUrl = buildUrl(settings.jiraUrl, `/rest/api/3/issue/${issueKey}/worklog`);
    const response = await fetch(requestUrl, {
        method: 'POST',
        headers: {
            'Authorization': getAuthHeader(settings.jiraEmail, settings.jiraToken),
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
    });

    if(!response.ok) throw new Error("Failed to create worklog");
}

// --- GROQ API ---

export const callGroq = async (prompt: string, settings: AppSettings, maxTokens = 300): Promise<string> => {
    if (!settings.groqApiKey) throw new Error("Groq API Key missing");

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${settings.groqApiKey}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            model: settings.groqModel || 'llama-3.3-70b-versatile',
            messages: [{ role: 'user', content: prompt }],
            max_tokens: maxTokens,
            temperature: 0.3
        })
    });

    if (!response.ok) throw new Error("Groq API failed");
    const json = await response.json();
    return json.choices?.[0]?.message?.content || '';
};
