/**
 * Version Check Utility
 * 
 * Ensures the app is running the latest deployed version
 * and provides cache-busting mechanisms for updates
 */

export const APP_VERSION = "2.0.1"; // Update this with each deployment
export const BUILD_TIMESTAMP = new Date().toISOString();

/**
 * Get current app version info
 */
export function getVersionInfo() {
  return {
    version: APP_VERSION,
    buildTime: BUILD_TIMESTAMP,
    commit: process.env.VERCEL_GIT_COMMIT_SHA?.substring(0, 7) || 'unknown',
    environment: process.env.NODE_ENV || 'development',
  };
}

/**
 * Add version headers to responses for cache busting
 */
export function addVersionHeaders(headers: Headers) {
  headers.set('X-App-Version', APP_VERSION);
  headers.set('X-Build-Time', BUILD_TIMESTAMP);
  headers.set('Cache-Control', 'no-cache, no-store, must-revalidate');
  headers.set('Pragma', 'no-cache');
  headers.set('Expires', '0');
  
  return headers;
}

/**
 * Check if Lambda backend is accessible
 */
export async function checkBackendHealth(): Promise<{
  healthy: boolean;
  version?: string;
  error?: string;
}> {
  try {
    const { LAMBDA_URLS } = await import('~/config/lambda.server');
    
    if (!LAMBDA_URLS.stores) {
      return {
        healthy: false,
        error: 'Lambda URLs not configured'
      };
    }

    const response = await fetch(`${LAMBDA_URLS.stores}/health`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(5000), // 5 second timeout
    });

    if (!response.ok) {
      return {
        healthy: false,
        error: `Backend returned ${response.status}: ${response.statusText}`
      };
    }

    const data = await response.json();
    
    return {
      healthy: true,
      version: data.version || 'unknown'
    };
  } catch (error) {
    return {
      healthy: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}