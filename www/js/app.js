'use strict';

/**
 * App state and section routing. Level-aware: each level has its own storage keys.
 */
(function () {
  var KEYS = window.APP_CONFIG.STORAGE_KEYS;
  var Storage = window.Storage;
  var Auth = window.Auth;
  var getCurrentLevel = window.APP_CONFIG.getCurrentLevel || function () { return 'first-middle'; };

  var curSection = 'home';
  var videos = [];
  var pdfList = [];
  var exercisesList = [];
  var testsList = [];

  function levelKey(base) {
    return base + '_' + getCurrentLevel();
  }

  function getLevelTitle() {
    var levels = window.APP_CONFIG.LEVELS || [];
    var level = getCurrentLevel();
    var found = levels.find(function (l) { return l.id === level; });
    return (found && found.title) ? found.title : 'مدارك التعليمية';
  }

  function normalizeDocItem(item) {
    return { id: item.id || null, title: item.title || '', desc: item.desc || '' };
  }

  function loadData() {
    videos = Storage.getItem(levelKey(KEYS.VIDEOS), defaultVideos());
    pdfList = (Storage.getItem(levelKey(KEYS.PDF_LIST), defaultPdfs()) || []).map(normalizeDocItem);
    exercisesList = (Storage.getItem(levelKey(KEYS.EXERCISES_LIST), defaultExercises()) || []).map(normalizeDocItem);
    testsList = (Storage.getItem(levelKey(KEYS.TESTS_LIST), defaultTests()) || []).map(normalizeDocItem);
  }

  function saveData() {
    Storage.setItem(levelKey(KEYS.VIDEOS), videos);
    Storage.setItem(levelKey(KEYS.PDF_LIST), pdfList);
    Storage.setItem(levelKey(KEYS.EXERCISES_LIST), exercisesList);
    Storage.setItem(levelKey(KEYS.TESTS_LIST), testsList);
  }

  function defaultVideos() {
    if (getCurrentLevel() !== 'first-middle') return [];
    return [
      { id: 'KOKfZKowOaI', title: 'Droites dans le plan : parallélisme et perpendicularité', desc: 'شرح درس الخطوط في المستوى: التوازي والعمودية' },
      { id: '34KkBOpkx2Y', title: 'Droites dans le plan : suite', desc: 'تكملة شرح درس الخطوط في المستوى' }
    ];
  }

  function defaultPdfs() {
    if (getCurrentLevel() !== 'first-middle') return [];
    return [
      { id: null, title: 'الخطوط في المستوى: التوازي والعمودية', desc: 'PDF - Droites dans le plan' },
      { id: null, title: 'المستقيمات الهامة في مثلث', desc: 'PDF - Droites remarquables du triangle' }
    ];
  }

  function defaultExercises() {
    if (getCurrentLevel() !== 'first-middle') return [];
    return [
      { id: null, title: 'سلسلة تمارين 1: الأعداد الكسرية', desc: 'تمارين متنوعة حول الأعداد الكسرية - السنة الأولى إعدادي' }
    ];
  }

  function defaultTests() {
    if (getCurrentLevel() !== 'first-middle') return [];
    return [
      { id: null, title: 'امتحان تجريبي في الرياضيات', desc: 'امتحان الفصل الأول - السنة الأولى إعدادي' }
    ];
  }

  function nav(section) {
    curSection = section;
    if (window.Navbar && window.Navbar.setActive) window.Navbar.setActive(section);
    render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function render() {
    var p = document.getElementById('page');
    if (!p) return;
    p.style.animation = 'none';
    p.offsetHeight;
    p.style.animation = '';
    if (window.Pages && window.Pages.render) {
      window.Pages.render(curSection);
    }
  }

  function getState() {
    return {
      curSection: curSection,
      videos: videos,
      pdfList: pdfList,
      exercisesList: exercisesList,
      testsList: testsList
    };
  }

  function getVideos() { return videos; }
  function getPdfList() { return pdfList; }
  function getExercisesList() { return exercisesList; }
  function getTestsList() { return testsList; }

  function setVideos(v) { videos = v; saveData(); }
  function setPdfList(v) { pdfList = v; saveData(); }
  function setExercisesList(v) { exercisesList = v; saveData(); }
  function setTestsList(v) { testsList = v; saveData(); }

  function init() {
    loadData();
    Auth.updateAdminUI();
  }

  window.App = {
    nav: nav,
    render: render,
    getState: getState,
    getCurSection: function () { return curSection; },
    getCurrentLevel: getCurrentLevel,
    getLevelTitle: getLevelTitle,
    getVideos: getVideos,
    getPdfList: getPdfList,
    getExercisesList: getExercisesList,
    getTestsList: getTestsList,
    setVideos: setVideos,
    setPdfList: setPdfList,
    setExercisesList: setExercisesList,
    setTestsList: setTestsList,
    init: init
  };
})();
