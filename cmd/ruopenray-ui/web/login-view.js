export function createLoginView({
  state,
  app,
  escapeHtml,
  login
}) {
  function loginView() {
    document.body.classList.add('is-login-page');
    const eyeIcon = state.passwordVisible
      ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3l18 18"></path><path d="M10.6 10.6a2 2 0 0 0 2.8 2.8"></path><path d="M9.9 4.2A10.5 10.5 0 0 1 12 4c5 0 8.6 3.6 10 8a13.3 13.3 0 0 1-3 4.7"></path><path d="M6.6 6.6A13 13 0 0 0 2 12c1.4 4.4 5 8 10 8 1.5 0 2.9-.3 4.1-.9"></path></svg>'
      : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"></path><circle cx="12" cy="12" r="3"></circle></svg>';
    app.innerHTML = `
      <main class="login">
        <form class="login-card" id="loginForm" action="/api/login" method="post" autocomplete="on">
          <div class="brand" style="margin-bottom: 18px">
            <img class="brand-mark" src="/assets/ruopenray-icon-512.png" alt="" />
            <div><strong>RuOpenRay UI</strong><span>Панель управления Xray</span></div>
          </div>
          <input class="browser-credential-user" id="username" name="username" value="ruopenray" autocomplete="username" tabindex="-1" aria-hidden="true" />
          <div class="form-row">
            <label>Пароль</label>
            <div class="password-field">
              <input id="password" name="password" type="${state.passwordVisible ? 'text' : 'password'}" value="${escapeHtml(state.password)}" autocomplete="current-password" autofocus />
              <button type="button" class="password-toggle" data-action="togglePassword" aria-label="${state.passwordVisible ? 'Скрыть пароль' : 'Показать пароль'}" title="${state.passwordVisible ? 'Скрыть пароль' : 'Показать пароль'}">${eyeIcon}</button>
            </div>
          </div>
          <label class="login-remember">
            <input id="rememberPassword" type="checkbox" ${state.rememberPassword ? 'checked' : ''} />
            <span>
              <strong>Запомнить вход</strong>
            </span>
          </label>
          <button class="btn" type="submit" style="width: 100%; height: 42px">Войти</button>
          ${state.message ? `<p class="notice" style="margin-top: 14px">${escapeHtml(state.message)}</p>` : ''}
        </form>
      </main>
    `;
    document.querySelector('#loginForm').addEventListener('submit', login);
    document.querySelector('#password').addEventListener('input', (event) => {
      state.password = event.target.value;
    });
    document.querySelector('#rememberPassword').addEventListener('change', (event) => {
      state.rememberPassword = event.target.checked;
    });
    document.querySelector('[data-action="togglePassword"]').addEventListener('click', () => {
      state.passwordVisible = !state.passwordVisible;
      loginView();
      const password = document.querySelector('#password');
      password.focus();
      password.setSelectionRange(password.value.length, password.value.length);
    });
  }

  return { loginView };
}
