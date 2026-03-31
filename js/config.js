'use strict';

/**
 * App config — credentials, storage keys, security, levels.
 * APP_VERSION is set by js/version.js which is loaded first.
 * To release a new version run: python bump-version.py <N>
 */
window.APP_CONFIG = {
  APP_VERSION: window.APP_VERSION || '3',
  /* ── SECURITY FIX: credentials removed from frontend ─────────────────
     Auth is now handled server-side via /api/auth endpoints.
     See server/auth.js + server/db.js for JWT-based authentication.
  ──────────────────────────────────────────────────────────────────── */
  API_URL: window.Capacitor?.isNativePlatform?.()
    ? (window.MADARIK_SERVER_URL || 'http://192.168.1.141:3000')
    : (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
      ? 'http://localhost:3000'
      : '',   // same-origin in production
  WS_URL: window.Capacitor?.isNativePlatform?.()
    ? (window.MADARIK_WS_URL || 'ws://192.168.1.141:3000')
    : (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
      ? 'ws://localhost:3000'
      : ('wss://' + location.host),
  STORAGE_KEYS: {
    // ── Existing keys (unchanged) ─────────────────────────────────────────
    ADMIN: 'madarik_admin_session',
    CHAT_USER: 'madarik_chat_user',
    CHAT_CONVOS: 'madarik_chat_convos',
    CHAT_PROFILE: 'madarik_chat_profile',
    CHAT_USERS_REGISTRY: 'madarik_users_registry',
    MIC_PERMISSION_DENIED: 'madarik_mic_denied',
    CAMERA_PERMISSION_DENIED: 'madarik_camera_denied',
    VIDEOS: 'madarik_videos',
    PDF_LIST: 'madarik_pdf_list',
    EXERCISES_LIST: 'madarik_exercises_list',
    TESTS_LIST: 'madarik_tests_list',

    // ── RBAC / Admin system (new) ─────────────────────────────────────────
    // Maps userId → { role, assignedBy, assignedAt }
    ADMIN_ROLES: 'madarik_admin_roles',
    // Hashed admin credentials array stored on first login bootstrap
    ADMIN_CREDENTIALS: 'madarik_admin_credentials',
    // Append-only admin action log: { id, ts, adminId, adminRole, action, targetId, details }
    AUDIT_LOGS: 'madarik_audit_logs',
    // User-submitted content reports: { id, ts, status, reporterId, targetUserId, ... }
    REPORTS: 'madarik_reports',
    // Maps userId → { status:'suspended'|'banned', reason, by, at, until }
    USER_SUSPENSIONS: 'madarik_suspensions',

    // ── Friend system ─────────────────────────────────────────────────────
    // { sent: [userId], received: [userId], accepted: [userId], rejected: [userId] }
    FRIENDS: 'madarik_friends',

    // ── Groups ────────────────────────────────────────────────────────────
    // Array of { id, name, members:[{id,name}], createdBy, createdAt }
    CHAT_GROUPS: 'madarik_chat_groups',

    // ── Lesson/Subject threaded chat ──────────────────────────────────────
    // Uses CHAT_CONVOS with special keys: 'subj:SUBJECT_ID' / 'lesson:LESSON_ID'
    LESSON_CHAT_PREFIX: 'lesson:',
    SUBJECT_CHAT_PREFIX: 'subj:'
  },
  IDB_NAME: 'MadarikPDFs',
  IDB_VERSION: 1,
  IDB_STORE: 'blobs',
  MAX_PDF_MB: 20,
  MAX_IMG_MB: 5,
  MAX_AUDIO_MB: 10,
  ADMIN_SESSION_TIMEOUT_MS: 30 * 60 * 1000,
  ALLOWED_IMAGE_TYPES: ['image/png', 'image/jpeg', 'image/webp'],
  ALLOWED_AUDIO_TYPES: ['audio/mpeg', 'audio/mp3', 'audio/ogg', 'audio/wav', 'audio/x-wav', 'audio/webm'],
  LEVELS: [
    { id: 'tcs-sciences', file: 'tcs-sciences.html', title: 'الجدع المشترك علمي' },
    { id: 'tcs-lettres', file: 'tcs-lettres.html', title: 'الجدع المشترك أدبي' },
    { id: '1bac-sef', file: '1bac-sef.html', title: 'الأولى باك - علوم تجريبية' },
    { id: '1bac-lettres', file: '1bac-lettres.html', title: 'الأولى باك - آداب' },
    { id: '2bac-pc', file: '2bac-pc.html', title: 'الثانية باك - علوم فيزيائية' },
    { id: '2bac-svt', file: '2bac-svt.html', title: 'الثانية باك - علوم الحياة والأرض' },
    { id: '2bac-lettres', file: '2bac-lettres.html', title: 'الثانية باك - آداب' }
  ],
  /** Subjects per level group — used for sidebar/dropdown filtering */
  SUBJECTS: {
    tcs: [
      { id: 'math', name: 'الرياضيات', icon: '📐' },
      { id: 'physics', name: 'الفيزياء والكيمياء', icon: '⚗️' },
      { id: 'life-earth', name: 'علوم الحياة والأرض', icon: '🌱' },
      { id: 'arabic', name: 'اللغة العربية', icon: '📖' },
      { id: 'french', name: 'اللغة الفرنسية', icon: '🇫🇷' },
      { id: 'english', name: 'اللغة الإنجليزية', icon: '🇬🇧' },
      { id: 'islamic', name: 'التربية الإسلامية', icon: '🕌' },
      { id: 'info', name: 'المعلوميات', icon: '💻' }
    ],
    bac: [
      { id: 'math', name: 'الرياضيات', icon: '📐' },
      { id: 'physics', name: 'الفيزياء والكيمياء', icon: '⚗️' },
      { id: 'life-earth', name: 'علوم الحياة والأرض', icon: '🌱' },
      { id: 'arabic', name: 'اللغة العربية', icon: '📖' },
      { id: 'french', name: 'اللغة الفرنسية', icon: '🇫🇷' },
      { id: 'english', name: 'اللغة الإنجليزية', icon: '🇬🇧' },
      { id: 'islamic', name: 'التربية الإسلامية', icon: '🕌' },
      { id: 'philosophy', name: 'الفلسفة', icon: '🧠' }
    ]
  },
  /** Weekly schedule template per level group */
  SCHEDULE_TEMPLATE: {
    days: ['الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'],
    slots: ['08:00 - 10:00', '10:00 - 12:00', '14:00 - 16:00', '16:00 - 18:00']
  }
};

window.APP_CONFIG.getCurrentLevel = function () {
  var body = document.body;
  var level = body && body.getAttribute ? body.getAttribute('data-level') : '';
  return level || 'tcs-sciences';
};
