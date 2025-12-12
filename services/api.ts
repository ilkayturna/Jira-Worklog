
import { AppSettings, Worklog, JiraIssue } from '../types';
import { plainTextToADF, parseJiraComment, secondsToHours } from '../utils/adf';

// --- PAYLOAD SANITIZER: Jira'ya göndermeden önce READ-ONLY alanları filtrele ---
/**
 * Worklog payload'ını temizler: sadece yazılabilir alanları tutar
 * Jira API, salt-okunur alanlar (id, self, author, updateAuthor, created, updated) gönderildiğinde 400 hatası verir
 * 
 * ALLOWED FIELDS (Jira API v3 PUT /issue/{issueId}/worklog/{id}):
 * - comment: ADF (Atlassian Document Format) object OR string
 * - started: ISO 8601 format string (e.g., "2024-01-01T09:00:00.000+0000")
 * - timeSpentSeconds: number (seconds)
 * - timeSpent: string (e.g., "1h 30m") - alternative to timeSpentSeconds
 * 
 * FORBIDDEN FIELDS (read-only, will cause 400 error):
 * - id, self, author, updateAuthor, created, updated, issueId
 */
interface SanitizedWorklogPayload {
  comment?: any; // ADF format or string
  timeSpentSeconds?: number;
  timeSpent?: string;
  started?: string;
}

const WORKLOG_EDITABLE_FIELDS = ['comment', 'timeSpentSeconds', 'timeSpent', 'started'] as const;
const WORKLOG_READONLY_FIELDS = ['id', 'self', 'author', 'updateAuthor', 'created', 'updated', 'issueId'] as const;

const sanitizeWorklogPayload = (payload: any): SanitizedWorklogPayload => {
  if (!payload || typeof payload !== 'object') {
    console.warn('⚠️ sanitizeWorklogPayload: received invalid payload:', typeof payload);
    return {};
  }

  const sanitized: SanitizedWorklogPayload = {};
  const removedFields: string[] = [];
  const includedFields: string[] = [];

  // Strict whitelist: only copy allowed fields
  for (const field of WORKLOG_EDITABLE_FIELDS) {
    if (field in payload && payload[field] !== undefined && payload[field] !== null) {
      // Validate specific field formats
      if (field === 'timeSpentSeconds') {
        const seconds = Number(payload[field]);
        // Allow up to 7 days (604800 seconds) per worklog - Jira's actual limit
        if (!isNaN(seconds) && seconds > 0 && seconds <= 604800) {
          sanitized.timeSpentSeconds = seconds;
          includedFields.push(`timeSpentSeconds=${seconds}`);
        } else {
          console.warn(`⚠️ Invalid timeSpentSeconds value: ${payload[field]} (must be 1-604800)`);
        }
      } else if (field === 'started') {
        // Validate ISO 8601 format
        const started = String(payload[field]);
        if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(started)) {
          sanitized.started = started;
          includedFields.push(`started=${started.substring(0, 16)}`);
        } else {
          console.warn(`⚠️ Invalid started format: ${started}`);
        }
      } else if (field === 'comment') {
        // Accept both ADF object and string
        if (payload[field]) {
          sanitized.comment = payload[field];
          includedFields.push('comment=(ADF/text)');
        }
      } else if (field === 'timeSpent') {
        // Alternative duration format (e.g., "1h 30m")
        const timeSpent = String(payload[field]);
        if (timeSpent.trim()) {
          sanitized.timeSpent = timeSpent;
          includedFields.push(`timeSpent=${timeSpent}`);
        }
      }
    }
  }

  // Log any forbidden fields that were present
  for (const field of WORKLOG_READONLY_FIELDS) {
    if (field in payload) {
      removedFields.push(field);
    }
  }

  if (removedFields.length > 0) {
    console.log(`🛡️ sanitizeWorklogPayload: Removed read-only fields: [${removedFields.join(', ')}]`);
  }
  
  console.log(`✅ sanitizeWorklogPayload: Included fields: [${includedFields.join(', ')}]`);

  return sanitized;
};

/**
 * Jira API hata yanıtını ayrıştırır ve anlamlı mesaj çıkarır
 * Jira API format: { errorMessages: string[], errors: { [field]: string | string[] } }
 * Proxy wrapper format: { error: string, status: number, details: JiraError }
 * 
 * CRITICAL: Always use JSON.stringify for error objects to prevent [object Object]
 */
const parseJiraErrorResponse = async (response: Response, defaultMsg: string): Promise<string> => {
  let rawBody: string | null = null;
  
  try {
    // Clone response to read body twice if needed
    const clonedResponse = response.clone();
    rawBody = await clonedResponse.text();
    
    // Log raw response for debugging
    console.error('🔍 Raw Jira API Error Response:', {
      status: response.status,
      statusText: response.statusText,
      rawBody: rawBody?.substring(0, 1000) // Truncate for safety
    });
    
    let errorData: any;
    try {
      errorData = JSON.parse(rawBody);
    } catch {
      // Not JSON, return raw text
      return rawBody?.trim() || `${defaultMsg} (${response.status})`;
    }
    
    // Handle proxy wrapper format: { error, status, details }
    if (errorData.details) {
      const details = errorData.details;
      
      // Recurse into details which contains actual Jira error
      if (details.errorMessages && Array.isArray(details.errorMessages) && details.errorMessages.length > 0) {
        return details.errorMessages[0];
      }
      
      if (details.errors && typeof details.errors === 'object') {
        const errorValues = Object.entries(details.errors)
          .map(([field, msg]) => {
            const fieldMsg = typeof msg === 'string' ? msg : Array.isArray(msg) ? msg[0] : JSON.stringify(msg);
            return `${field}: ${fieldMsg}`;
          })
          .filter(Boolean);
        
        if (errorValues.length > 0) {
          return errorValues.join('; ');
        }
      }
      
      // If details is a string
      if (typeof details === 'string') {
        return details;
      }
      
      // Fallback: serialize details
      return JSON.stringify(details, null, 2);
    }
    
    // Direct Jira error format: errorMessages array (Primary source)
    if (errorData.errorMessages && Array.isArray(errorData.errorMessages) && errorData.errorMessages.length > 0) {
      return errorData.errorMessages[0];
    }
    
    // Direct Jira error format: errors object (Field-specific errors)
    if (errorData.errors && typeof errorData.errors === 'object') {
      const errorValues = Object.entries(errorData.errors)
        .map(([field, msg]) => {
          const fieldMsg = typeof msg === 'string' ? msg : Array.isArray(msg) ? msg[0] : JSON.stringify(msg);
          return `${field}: ${fieldMsg}`;
        })
        .filter(Boolean);
      
      if (errorValues.length > 0) {
        return errorValues.join('; ');
      }
    }
    
    // Generic error message field
    if (errorData.error && typeof errorData.error === 'string') {
      return errorData.error;
    }
    
    // Last resort: stringify the entire error object
    return JSON.stringify(errorData, null, 2);
  } catch (e) {
    // Catastrophic failure - log everything we have
    console.error('❌ parseJiraErrorResponse CRITICAL FAILURE:', {
      parseError: e instanceof Error ? e.message : String(e),
      rawBody: rawBody?.substring(0, 500),
      responseStatus: response.status
    });
  }
  
  return `${defaultMsg} (${response.status})`;
};

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
        maxResults: 100
        // Note: validateQuery is NOT supported in /rest/api/3/search/jql endpoint
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
    // Input validation
    if (!wl || !wl.id || !wl.issueKey) {
        const errMsg = 'updateWorklog: Invalid worklog object - missing id or issueKey';
        console.error('❌', errMsg, { wl: JSON.stringify(wl, null, 2) });
        throw new Error(errMsg);
    }

    if (!settings?.jiraUrl || !settings?.jiraEmail || !settings?.jiraToken) {
        throw new Error('updateWorklog: Missing Jira credentials');
    }

    try {
        // 1. BUILD PAYLOAD - Only include editable fields
        const payload: Record<string, any> = {};
        
        // Started date (required by Jira)
        if (newDate) {
            // Validate date format
            if (!/^\d{4}-\d{2}-\d{2}$/.test(newDate)) {
                throw new Error(`Invalid date format: ${newDate}. Expected YYYY-MM-DD`);
            }
            payload.started = `${newDate}T09:00:00.000+0000`;
        } else if (wl.started) {
            payload.started = wl.started;
        } else {
            // Fallback to today
            const today = new Date().toISOString().split('T')[0];
            payload.started = `${today}T09:00:00.000+0000`;
            console.warn('⚠️ No started date provided, using today');
        }
        
        // Time spent (required by Jira)
        const seconds = newSeconds !== undefined ? newSeconds : wl.seconds;
        if (typeof seconds !== 'number' || seconds <= 0) {
            throw new Error(`Invalid timeSpentSeconds: ${seconds}`);
        }
        payload.timeSpentSeconds = seconds;

        // Comment handling - CRITICAL: Always include comment in payload
        // Jira API v3 may return 400 if comment is missing during update
        if (newComment !== undefined && newComment !== null) {
            // New comment provided - convert to ADF
            const trimmedComment = String(newComment).trim();
            if (trimmedComment.length > 0) {
                const adf = plainTextToADF(trimmedComment);
                if (adf) {
                    payload.comment = adf;
                    console.log('📝 Using new comment (ADF converted)');
                }
            } else {
                // Empty string comment - create minimal ADF
                payload.comment = { type: 'doc', version: 1, content: [{ type: 'paragraph', content: [{ type: 'text', text: ' ' }] }] };
                console.log('📝 Using empty comment placeholder');
            }
        } else if (wl.originalADF) {
            // Preserve original ADF comment
            payload.comment = wl.originalADF;
            console.log('📝 Preserving original ADF comment');
        } else if (wl.comment) {
            // Fallback: Convert existing plain text comment to ADF
            const adf = plainTextToADF(wl.comment);
            if (adf) {
                payload.comment = adf;
                console.log('📝 Converting existing plain text comment to ADF');
            }
        }
        // If still no comment, create minimal placeholder (Jira sometimes requires it)
        if (!payload.comment) {
            payload.comment = { type: 'doc', version: 1, content: [{ type: 'paragraph', content: [{ type: 'text', text: '-' }] }] };
            console.log('📝 Using fallback minimal comment');
        }

        // 2. SANITIZE PAYLOAD - Remove any read-only fields that might have leaked
        const cleanBody = sanitizeWorklogPayload(payload);
        
        // Validate sanitized payload has required fields
        if (!cleanBody.started || !cleanBody.timeSpentSeconds) {
            console.error('❌ Sanitized payload missing required fields:', JSON.stringify(cleanBody, null, 2));
            throw new Error('Invalid payload: missing started or timeSpentSeconds after sanitization');
        }
        
        console.log(`🔄 Updating worklog ${wl.id} on ${wl.issueKey}`, {
            sanitizedPayload: JSON.stringify(cleanBody, null, 2),
            originalSeconds: wl.seconds,
            newSeconds: newSeconds,
            hasComment: !!cleanBody.comment
        });

        const targetUrl = `${normalizeUrl(settings.jiraUrl)}/rest/api/3/issue/${wl.issueKey}/worklog/${wl.id}`;
        
        const response = await fetchThroughProxy(targetUrl, 'PUT', {
            'Authorization': getAuthHeader(settings.jiraEmail, settings.jiraToken),
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        }, cleanBody);

        if (!response.ok) {
            const errorMsg = await parseJiraErrorResponse(response, 'Worklog güncellenemedi');
            console.error('❌ Worklog update failed:', {
                status: response.status,
                statusText: response.statusText,
                errorMessage: errorMsg,
                worklogId: wl.id,
                issueKey: wl.issueKey,
                sentPayload: JSON.stringify(cleanBody, null, 2)
            });
            throw new Error(errorMsg);
        }

        // 3. PARSE AND RETURN RESPONSE
        const updatedWorklog = await response.json();
        console.log(`✅ Worklog ${wl.id} updated successfully`, {
            newTimeSpentSeconds: updatedWorklog.timeSpentSeconds,
            newStarted: updatedWorklog.started
        });
        
        return updatedWorklog;
    } catch (error: unknown) {
        // CRITICAL: Never use string concatenation with error objects
        const errorMessage = error instanceof Error ? error.message : JSON.stringify(error, null, 2);
        const errorStack = error instanceof Error ? error.stack : undefined;
        
        console.error('❌ updateWorklog FAILED:', {
            errorMessage,
            errorStack,
            worklogId: wl.id,
            issueKey: wl.issueKey,
            errorType: typeof error,
            errorConstructor: error?.constructor?.name
        });
        
        // Re-throw with clean message
        if (error instanceof Error) {
            throw error;
        }
        throw new Error(errorMessage);
    }
};

export const createWorklog = async (issueKey: string, dateStr: string, seconds: number, comment: string, settings: AppSettings) => {
    // Input validation
    if (!issueKey?.trim()) {
        throw new Error('createWorklog: issueKey is required');
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        throw new Error(`createWorklog: Invalid date format: ${dateStr}. Expected YYYY-MM-DD`);
    }
    if (typeof seconds !== 'number' || seconds <= 0 || seconds > 604800) {
        throw new Error(`createWorklog: Invalid seconds value: ${seconds}. Must be between 1 and 604800 (7 days)`);
    }
    if (!settings?.jiraUrl || !settings?.jiraEmail || !settings?.jiraToken) {
        throw new Error('createWorklog: Missing Jira credentials');
    }

    try {
        // 1. BUILD PAYLOAD
        const started = `${dateStr}T09:00:00.000+0000`;
        
        const payload: Record<string, any> = {
            timeSpentSeconds: seconds,
            started: started
        };
        
        // Only add comment if provided
        if (comment?.trim()) {
            const adf = plainTextToADF(comment);
            if (adf) {
                payload.comment = adf;
            }
        }

        // 2. SANITIZE PAYLOAD (extra safety layer)
        const cleanBody = sanitizeWorklogPayload(payload);
        
        console.log(`➕ Creating worklog on ${issueKey}`, {
            sanitizedPayload: JSON.stringify(cleanBody, null, 2),
            seconds: seconds,
            hasComment: !!cleanBody.comment
        });

        const targetUrl = `${normalizeUrl(settings.jiraUrl)}/rest/api/3/issue/${issueKey}/worklog`;
        
        const response = await fetchThroughProxy(targetUrl, 'POST', {
            'Authorization': getAuthHeader(settings.jiraEmail, settings.jiraToken),
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        }, cleanBody);

        if (!response.ok) {
            const errorMsg = await parseJiraErrorResponse(response, 'Worklog oluşturulamadı');
            console.error('❌ Worklog creation failed:', {
                status: response.status,
                statusText: response.statusText,
                errorMessage: errorMsg,
                issueKey: issueKey,
                seconds: seconds,
                sentPayload: JSON.stringify(cleanBody, null, 2)
            });
            throw new Error(errorMsg);
        }

        // 3. PARSE AND RETURN RESPONSE
        const newWorklog = await response.json();
        console.log(`✅ Worklog created successfully on ${issueKey}`, {
            worklogId: newWorklog.id,
            timeSpentSeconds: newWorklog.timeSpentSeconds
        });
        
        return newWorklog;
    } catch (error: unknown) {
        // CRITICAL: Never use string concatenation with error objects
        const errorMessage = error instanceof Error ? error.message : JSON.stringify(error, null, 2);
        const errorStack = error instanceof Error ? error.stack : undefined;
        
        console.error('❌ createWorklog FAILED:', {
            errorMessage,
            errorStack,
            issueKey,
            dateStr,
            seconds,
            errorType: typeof error,
            errorConstructor: error?.constructor?.name
        });
        
        if (error instanceof Error) {
            throw error;
        }
        throw new Error(errorMessage);
    }
}

// Worklog'u sil (undo için)
export const deleteWorklog = async (issueKey: string, worklogId: string, settings: AppSettings) => {
    // Input validation
    if (!issueKey?.trim()) {
        throw new Error('deleteWorklog: issueKey is required');
    }
    if (!worklogId?.trim()) {
        throw new Error('deleteWorklog: worklogId is required');
    }
    if (!settings?.jiraUrl || !settings?.jiraEmail || !settings?.jiraToken) {
        throw new Error('deleteWorklog: Missing Jira credentials');
    }

    try {
        console.log(`🗑️ Deleting worklog ${worklogId} from ${issueKey}`);

        const targetUrl = `${normalizeUrl(settings.jiraUrl)}/rest/api/3/issue/${issueKey}/worklog/${worklogId}`;
        
        const response = await fetchThroughProxy(targetUrl, 'DELETE', {
            'Authorization': getAuthHeader(settings.jiraEmail, settings.jiraToken),
            'Accept': 'application/json'
        });

        if (!response.ok) {
            const errorMsg = await parseJiraErrorResponse(response, 'Worklog silinemedi');
            console.error('❌ Worklog deletion failed:', {
                status: response.status,
                statusText: response.statusText,
                errorMessage: errorMsg,
                issueKey: issueKey,
                worklogId: worklogId
            });
            throw new Error(errorMsg);
        }

        console.log(`✅ Worklog ${worklogId} deleted successfully`);
        
        // DELETE endpoint returns 204 No Content or 200 OK without body
        try {
            const result = await response.json();
            return result;
        } catch {
            return null; // DELETE usually returns empty body
        }
    } catch (error: unknown) {
        // CRITICAL: Never use string concatenation with error objects
        const errorMessage = error instanceof Error ? error.message : JSON.stringify(error, null, 2);
        const errorStack = error instanceof Error ? error.stack : undefined;
        
        console.error('❌ deleteWorklog FAILED:', {
            errorMessage,
            errorStack,
            issueKey,
            worklogId,
            errorType: typeof error,
            errorConstructor: error?.constructor?.name
        });
        
        if (error instanceof Error) {
            throw error;
        }
        throw new Error(errorMessage);
    }
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

// Issue detaylarını çek (Sprint, Epic, Parent dahil) - Genişletilmiş bilgi için
export const fetchIssueDetails = async (issueKey: string, settings: AppSettings): Promise<JiraIssue | null> => {
    if (!settings.jiraUrl || !settings.jiraEmail || !settings.jiraToken) {
        return null;
    }

    try {
        // Extended fields for sprint, epic, parent info
        const fields = [
            'description', 'summary', 'project', 'status', 'assignee', 'reporter',
            'priority', 'labels', 'components', 'created', 'updated',
            'parent', 'subtasks', 'issuetype',
            'customfield_10020', // Sprint field (common custom field ID)
            'customfield_10014', // Epic Link (common custom field ID)
            'customfield_10011', // Epic Name (common custom field ID)
            'timeoriginalestimate', 'timeestimate', 'timespent'
        ].join(',');
        
        const targetUrl = `${normalizeUrl(settings.jiraUrl)}/rest/api/3/issue/${issueKey}?fields=${fields}&expand=names`;
        
        const response = await fetchThroughProxy(targetUrl, 'GET', {
            'Authorization': getAuthHeader(settings.jiraEmail, settings.jiraToken),
            'Accept': 'application/json'
        });

        if (!response.ok) return null;

        const data = await response.json();
        const fields_data = data.fields || {};
        
        // Parse sprint info (customfield_10020 is common but may vary)
        let sprint: JiraIssue['sprint'] = undefined;
        const sprintData = fields_data.customfield_10020;
        if (Array.isArray(sprintData) && sprintData.length > 0) {
            const activeSprint = sprintData.find((s: any) => s.state === 'active') || sprintData[0];
            if (activeSprint) {
                sprint = {
                    id: activeSprint.id,
                    name: activeSprint.name,
                    state: activeSprint.state,
                    startDate: activeSprint.startDate,
                    endDate: activeSprint.endDate,
                    goal: activeSprint.goal
                };
            }
        }

        // Parse epic info
        let epic: JiraIssue['epic'] = undefined;
        const epicKey = fields_data.customfield_10014 || fields_data.parent?.key;
        const epicName = fields_data.customfield_10011;
        if (epicKey || epicName) {
            epic = {
                key: epicKey || '',
                name: epicName || '',
                summary: fields_data.parent?.fields?.summary || epicName || ''
            };
        }

        // Parse parent (for subtasks)
        let parent: JiraIssue['parent'] = undefined;
        if (fields_data.parent) {
            parent = {
                key: fields_data.parent.key,
                summary: fields_data.parent.fields?.summary || '',
                issueType: fields_data.parent.fields?.issuetype?.name
            };
        }

        // Parse subtasks
        let subtasks: JiraIssue['subtasks'] = undefined;
        if (Array.isArray(fields_data.subtasks) && fields_data.subtasks.length > 0) {
            subtasks = fields_data.subtasks.map((st: any) => ({
                key: st.key,
                summary: st.fields?.summary || '',
                status: st.fields?.status?.name
            }));
        }

        return {
            key: issueKey,
            summary: fields_data.summary || '',
            description: parseJiraComment(fields_data.description) || '',
            projectName: fields_data.project?.name || '',
            issueType: fields_data.issuetype?.name,
            status: fields_data.status?.name,
            priority: fields_data.priority?.name,
            priorityIconUrl: fields_data.priority?.iconUrl,
            assignee: fields_data.assignee?.displayName,
            reporter: fields_data.reporter?.displayName,
            created: fields_data.created,
            updated: fields_data.updated,
            labels: fields_data.labels || [],
            components: fields_data.components?.map((c: any) => c.name) || [],
            sprint,
            epic,
            parent,
            subtasks,
            originalEstimate: fields_data.timeoriginalestimate,
            remainingEstimate: fields_data.timeestimate,
            timeSpent: fields_data.timespent
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
