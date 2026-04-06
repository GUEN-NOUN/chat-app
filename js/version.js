/**
 * ╔══════════════════════════════════════════╗
 * ║  SINGLE SOURCE OF TRUTH — App Version   ║
 * ║                                          ║
 * ║  To release a new version:               ║
 * ║    python bump-version.py <new_version>  ║
 * ║                                          ║
 * ║  That command updates:                   ║
 * ║    • This file (APP_VERSION)             ║
 * ║    • sw.js  (CACHE_VERSION)              ║
 * ║    • All HTML ?v= query strings          ║
 * ║    • version.json                        ║
 * ╚══════════════════════════════════════════╝
 */

window.APP_VERSION = '3';

console.log('%c[Madarik] App Version: ' + window.APP_VERSION,
  'color:#5b82ff;font-weight:bold;font-size:12px');
