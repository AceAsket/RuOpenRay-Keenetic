package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestAPILoginAndAuth(t *testing.T) {
	state := &serverState{
		cfg:      appConfig{Password: "secret-pass"},
		sessions: map[string]bool{},
	}

	unauthorized := httptest.NewRecorder()
	state.handleAPI(unauthorized, httptest.NewRequest(http.MethodGet, "/api/status", nil))
	if unauthorized.Code != http.StatusUnauthorized {
		t.Fatalf("expected unauthorized status, got %d", unauthorized.Code)
	}

	login := httptest.NewRecorder()
	state.handleAPI(login, httptest.NewRequest(http.MethodPost, "/api/login", strings.NewReader(`{"password":"secret-pass"}`)))
	if login.Code != http.StatusOK {
		t.Fatalf("expected successful login, got %d: %s", login.Code, login.Body.String())
	}
	if state.sessionCount() != 1 {
		t.Fatalf("expected one session, got %d", state.sessionCount())
	}
	if cookie := login.Result().Cookies(); len(cookie) == 0 || cookie[0].Name != "openray_session" {
		t.Fatalf("login did not set session cookie")
	}
}

func TestAPILoginRejectsWrongPassword(t *testing.T) {
	state := &serverState{
		cfg:      appConfig{Password: "secret-pass"},
		sessions: map[string]bool{},
	}
	response := httptest.NewRecorder()
	state.handleAPI(response, httptest.NewRequest(http.MethodPost, "/api/login", strings.NewReader(`{"password":"wrong"}`)))
	if response.Code != http.StatusUnauthorized {
		t.Fatalf("expected unauthorized status, got %d", response.Code)
	}
	if state.sessionCount() != 0 {
		t.Fatalf("wrong password created sessions: %#v", state.sessions)
	}
}

func TestAPILoginRejectsOversizedBody(t *testing.T) {
	state := &serverState{
		cfg: appConfig{Password: "secret-pass"},
	}
	response := httptest.NewRecorder()
	body := strings.NewReader(`{"password":"` + strings.Repeat("x", maxJSONBodyBytes) + `"}`)
	state.handleAPI(response, httptest.NewRequest(http.MethodPost, "/api/login", body))
	if response.Code != http.StatusBadRequest {
		t.Fatalf("expected bad request status, got %d", response.Code)
	}
	if state.sessionCount() != 0 {
		t.Fatalf("oversized body created sessions: %#v", state.sessions)
	}
}

func TestAPIRememberLoginSurvivesRestart(t *testing.T) {
	state := &serverState{
		cfg:      appConfig{Password: "secret-pass"},
		sessions: map[string]bool{},
	}
	login := httptest.NewRecorder()
	state.handleAPI(login, httptest.NewRequest(http.MethodPost, "/api/login", strings.NewReader(`{"password":"secret-pass","remember":true}`)))
	if login.Code != http.StatusOK {
		t.Fatalf("expected successful login, got %d: %s", login.Code, login.Body.String())
	}
	var payload map[string]any
	if err := json.Unmarshal(login.Body.Bytes(), &payload); err != nil {
		t.Fatal(err)
	}
	token, _ := payload["token"].(string)
	if !strings.HasPrefix(token, "remember.v1.") {
		t.Fatalf("expected remember token, got %q", token)
	}

	restarted := &serverState{cfg: appConfig{Password: "secret-pass"}, sessions: map[string]bool{}}
	req := httptest.NewRequest(http.MethodGet, "/api/status", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	if !restarted.authed(req) {
		t.Fatal("remember token was not accepted after restart")
	}
}

func TestRememberTokenInvalidAfterPasswordChangeOrExpiry(t *testing.T) {
	token := signedRememberToken("old-pass", time.Now().Add(time.Hour))
	if !validRememberToken("old-pass", token, time.Now()) {
		t.Fatal("fresh remember token should be valid with the same password")
	}
	if validRememberToken("new-pass", token, time.Now()) {
		t.Fatal("remember token should not survive password change")
	}
	expired := signedRememberToken("old-pass", time.Now().Add(-time.Minute))
	if validRememberToken("old-pass", expired, time.Now()) {
		t.Fatal("expired remember token should be rejected")
	}
}
