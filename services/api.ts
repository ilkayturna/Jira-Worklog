
import { AppSettings, Worklog, JiraIssue } from '../types';
import { plainTextToADF, parseJiraComment, secondsToHours } from '../utils/adf';

// --- TYPE DEFINITIONS ---
interface FetchOptions {
  method: string;
  headers: Record<string, string>;
  body?: string;
  signal?: AbortSignal;
}

interface RetryConfig {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
  retryableStatuses: number[];
}

// --- CONSTANTS ---
const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelay: 1000,
  maxDelay: 10000,
  retryableStatuses: [408, 429, 500, 502, 503, 504]
};

const REQUEST_TIMEOUT = 30000; // 30 seconds

// --- UTILITY FUNCTIONS ---

const getAuthHeader = (email: string, token: string): string => {
  if (!email || !token) {
    throw new Error('Email and token are required for authentication');
  }
  // Basic Auth: email:token format (base64 encoded)
  return 'Basic ' + btoa(`${email.trim()}:${token.trim()}`);
};

const normalizeUrl = (url: string): string => {
  if (!url) throw new Error('URL is required');
  
  let normalized = url.trim().replace(/\/$/, '');
  
  // Add https if no protocol specified
  if (!normalized.match(/^https?:\/\//i)) {
    normalized = `https://${normalized}`;
  }
  
  // Validate URL format
  try {
    new URL(normalized);
  } catch {
    throw new Error(`Invalid URL format: ${url}`);
  }
  
  return normalized;
};

// Exponential backoff with jitter
const calculateBackoff = (attempt: number, baseDelay: number, maxDelay: number): number => {
  const exponentialDelay = baseDelay * Math.pow(2, attempt);
  const jitter = Math.random() * 0.3 * exponentialDelay; // 30% jitter
  return Math.min(exponentialDelay + jitter, maxDelay);
};

// Enhanced fetch with retry logic, timeout, and proper error handling
const fetchThroughProxy = async (
  targetUrl: string,
  method: string,
  headers: Record<string, string>,
  body?: any,
  config: Partial<RetryConfig> = {},
  abortSignal?: AbortSignal
): Promise<Response> => {
  const retryConfig = { ...DEFAULT_RETRY_CONFIG, ...config };
  const proxyUrl = `/api/proxy?url=${encodeURIComponent(targetUrl)}`;

  // Validate inputs
  if (!targetUrl) throw new Error('Target URL is required');
  if (!method) throw new Error('HTTP method is required');

  const options: FetchOptions = {
    method,
    headers: {
      ...headers,
      'Content-Type': headers['Content-Type'] || 'application/json'
    }
  };

  // Handle request body
  if (body !== undefined) {
    if (typeof body === 'object' && body !== null) {
      options.body = JSON.stringify(body);
    } else if (typeof body === 'string') {
      options.body = body;
    } else {
      throw new Error('Invalid body type');
    }
  }

  // Add abort signal if provided
  if (abortSignal) {
    options.signal = abortSignal;
  }

  let lastError: Error | null = null;

  for (let attempt = 0; attempt < retryConfig.maxRetries; attempt++) {
    try {
      // Create timeout controller
      const timeoutController = new AbortController();
      const timeoutId = setTimeout(() => timeoutController.abort(), REQUEST_TIMEOUT);

      // Combine abort signals
      const combinedSignal = abortSignal
        ? combineAbortSignals([abortSignal, timeoutController.signal])
        : timeoutController.signal;

      const response = await fetch(proxyUrl, {
        ...options,
        signal: combinedSignal
      });

      clearTimeout(timeoutId);

      // Check if response should trigger retry
      if (retryConfig.retryableStatuses.includes(response.status)) {
        throw new Error(`Retryable HTTP error: ${response.status}`);
      }

      // Success - return response
      if (response.ok || attempt === retryConfig.maxRetries - 1) {
        return response;
      }

      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    } catch (error: any) {
      lastError = error;

      // Don't retry on abort or non-retryable errors
      if (error.name === 'AbortError') {
        throw new Error('Request aborted');
      }

      // Log retry attempt
      console.warn(`🔄 Retry ${attempt + 1}/${retryConfig.maxRetries} for ${method} ${targetUrl}`);

      // Don't wait on last attempt
      if (attempt < retryConfig.maxRetries - 1) {
        const delay = calculateBackoff(attempt, retryConfig.baseDelay, retryConfig.maxDelay);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError || new Error('Request failed after all retries');
};

// Helper to combine multiple abort signals
const combineAbortSignals = (signals: AbortSignal[]): AbortSignal => {
  const controller = new AbortController();
  
  signals.forEach(signal => {
    if (signal.aborted) {
      controller.abort();
    } else {
      signal.addEventListener('abort', () => controller.abort(), { once: true });
    }
  });
  
  return controller.signal;
};

// --- JIRA API FUNCTIONS ---

export const fetchWorklogs = async (
  date: string,
  settings: AppSettings,
  abortSignal?: AbortSignal
): Promise<Worklog[]> => {
  // Validation
  if (!settings.jiraUrl || !settings.jiraEmail || !settings.jiraToken) {
    throw new Error('❌ Jira settings incomplete. Please check configuration.');
  }

  // Validate date format (YYYY-MM-DD)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error(`❌ Invalid date format: ${date}. Expected YYYY-MM-DD`);
  }

  try {
    // Build JQL query with proper escaping
    const jql = `worklogDate = "${date}" AND worklogAuthor = currentUser()`;
    const targetUrl = `${normalizeUrl(settings.jiraUrl)}/rest/api/3/search/jql`;

    console.log(`📡 Fetching worklogs for ${date}...`);

    const response = await fetchThroughProxy(
      targetUrl,
      'POST',
      {
        'Authorization': getAuthHeader(settings.jiraEmail, settings.jiraToken),
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      },
      {
        jql,
        fields: ['worklog', 'summary', 'assignee'],
        maxResults: 100,
        validateQuery: true
      },
      undefined,
      abortSignal
    );

    if (!response.ok) {
      let errorDetail = 'Unknown error';
      try {
        const json = await response.json();
        errorDetail = json.errorMessages?.join(', ') || json.details || JSON.stringify(json);
      } catch {
        try {
          errorDetail = await response.text();
        } catch {
          errorDetail = response.statusText;
        }
      }
      throw new Error(`Jira API Error (${response.status}): ${errorDetail}`);
    }

    const data = await response.json();
    const issues = data.issues || [];

    if (!Array.isArray(issues)) {
      throw new Error('Invalid response format: issues array not found');
    }

    console.log(`📊 Found ${issues.length} issues with worklogs`);

    // Process worklogs in parallel with error isolation
    const worklogPromises = issues.map(async (issue: any) => {
      try {
        return await processIssueWorklogs(issue, date, settings, abortSignal);
      } catch (error) {
        console.error(`❌ Error processing issue ${issue.key}:`, error);
        return []; // Return empty array on error, don't fail entire request
      }
    });

    const worklogArrays = await Promise.all(worklogPromises);
    const allWorklogs = worklogArrays.flat();

    console.log(`✅ Retrieved ${allWorklogs.length} worklogs for ${date}`);
    return allWorklogs;
  } catch (error: any) {
    if (error.name === 'AbortError' || error.message.includes('aborted')) {
      console.log('🛑 Fetch aborted');
      throw new Error('Request was cancelled');
    }

    console.error('❌ fetchWorklogs error:', error);
    throw error;
  }
};

// Helper function to process issue worklogs
const processIssueWorklogs = async (
  issue: any,
  targetDate: string,
  settings: AppSettings,
  abortSignal?: AbortSignal
): Promise<Worklog[]> => {
  if (!issue || !issue.key) {
    return [];
  }

  let worklogs = [];
  const worklogField = issue.fields?.worklog;

  // Optimization: Use embedded worklogs if complete
  if (worklogField?.worklogs && worklogField.total <= worklogField.maxResults) {
    worklogs = worklogField.worklogs;
  } else {
    // Fetch worklogs separately
    const wlUrl = `${normalizeUrl(settings.jiraUrl)}/rest/api/3/issue/${issue.key}/worklog`;
    
    try {
      const wlResponse = await fetchThroughProxy(
        wlUrl,
        'GET',
        {
          'Authorization': getAuthHeader(settings.jiraEmail, settings.jiraToken),
          'Accept': 'application/json'
        },
        undefined,
        { maxRetries: 2 }, // Fewer retries for individual worklogs
        abortSignal
      );

      if (wlResponse.ok) {
        const wlData = await wlResponse.json();
        worklogs = wlData.worklogs || [];
      }
    } catch (error) {
      console.warn(`⚠️ Could not fetch worklogs for ${issue.key}`);
      return [];
    }
  }

  // Filter and transform worklogs
  const userEmail = settings.jiraEmail.toLowerCase();
  const result: Worklog[] = [];

  worklogs.forEach((wl: any) => {
    try {
      // Validate worklog structure
      if (!wl.id || !wl.started || !wl.timeSpentSeconds) {
        return;
      }

      const wlDate = wl.started.split('T')[0];
      
      // Date filter
      if (wlDate !== targetDate) {
        return;
      }

      // Author filter (strict email validation)
      const authorEmail = wl.author?.emailAddress?.toLowerCase();
      if (authorEmail && authorEmail !== userEmail) {
        return;
      }

      // Create worklog entry
      result.push({
        id: wl.id,
        issueKey: issue.key,
        summary: issue.fields?.summary || 'No summary',
        seconds: wl.timeSpentSeconds,
        hours: secondsToHours(wl.timeSpentSeconds),
        comment: parseJiraComment(wl.comment),
        started: wl.started,
        author: wl.author?.displayName,
        originalADF: wl.comment
      });
    } catch (error) {
      console.error(`Error parsing worklog ${wl.id}:`, error);
    }
  });

  return result;
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
