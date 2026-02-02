// src/lib/inAppBrowser.js

export function isInAppBrowser(userAgent = '') {
  const ua = (userAgent || '').toLowerCase()

  // Common in-app / webview identifiers (Facebook, Instagram, LinkedIn, etc.)
  const inAppHints = [
    'fban', // Facebook app
    'fbav', // Facebook app
    'instagram',
    'messenger',
    'line',
    'linkedinapp',
    'snapchat',
    'twitter',
    'tiktok',
    'pinterest',
    'wechat',
    'micromessenger',
    'whatsapp',
    'yahoo', // Yahoo app browser often includes "Yahoo"
    'yjapp', // Yahoo Japan
    'duckduckgo',
    'gsa', // Google Search App
    'wv', // Android WebView
  ]

  return inAppHints.some((hint) => ua.includes(hint))
}

export function getOpenInBrowserInstructions() {
  // Very lightweight platform check, no dependencies.
  const ua = (typeof navigator !== 'undefined' ? navigator.userAgent : '').toLowerCase()
  const isIOS = /iphone|ipad|ipod/.test(ua)
  const isAndroid = /android/.test(ua)

  if (isIOS) {
    return 'Tap the Share icon, then “Open in Safari”.'
  }
  if (isAndroid) {
    return 'Tap the ⋮ menu, then “Open in Chrome”.'
  }
  return 'Open this page in your default browser (Safari / Chrome).'
}