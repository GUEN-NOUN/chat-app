// Navbar — set brand name without destroying the navbar HTML structure
(function () {
  'use strict';
  var brand = document.querySelector('#navbar .brand-name');
  if (brand) brand.innerHTML = 'مدارك <span>التعليمية</span>';
})();
