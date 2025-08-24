  const toggle = document.getElementById('darkModeToggle');

  document.addEventListener('DOMContentLoaded', function() {
    function getSavedTheme() {
      try {
        if (localStorage.getItem('dark-mode') !== null) {
          return localStorage.getItem('dark-mode') === 'true';
        }
      } catch (e) {}
      const params = new URLSearchParams(window.location.search);
      if (params.has('theme')) return params.get('theme') === 'dark';
      const match = document.cookie.match(/theme=(dark|light)/);
      return match ? match[1] === 'dark' : false;
    }

    function saveTheme(isDark) {
      try {
        localStorage.setItem('dark-mode', isDark);
      } catch (e) {}
      document.cookie = `theme=${isDark ? 'dark' : 'light'}; path=/; max-age=31536000`;
    }

    if (getSavedTheme()) {
      document.body.classList.add('dark-mode');
    }

    toggle.addEventListener('click', () => {
      document.body.classList.toggle('dark-mode');
      saveTheme(document.body.classList.contains('dark-mode'));
    });
  });

  function togglePassword(id1, id2, checkbox) {
    const field1 = document.getElementById(id1);
    if (field1) field1.type = checkbox.checked ? "text" : "password";
    if (id2) {
      const field2 = document.getElementById(id2);
      if (field2) field2.type = checkbox.checked ? "text" : "password";
    }
  }