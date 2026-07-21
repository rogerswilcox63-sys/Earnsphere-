// Always use the live backend, even on localhost
(function() {
  window.API_BASE_URL = 'https://earnsphere-ai.onrender.com';
  console.log(`🌐 API_BASE_URL set to: ${window.API_BASE_URL}`);
})();