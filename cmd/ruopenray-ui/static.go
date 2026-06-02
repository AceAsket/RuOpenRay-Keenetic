package main

import (
	"embed"
	"io/fs"
	"mime"
	"net/http"
	"path/filepath"
	"strings"
)

//go:embed web/*
var embeddedFiles embed.FS

func (s *serverState) handleStatic(w http.ResponseWriter, r *http.Request) {
	path := strings.TrimPrefix(r.URL.Path, "/")
	if path == "" {
		path = "index.html"
	}
	fullPath := "web/" + filepath.ToSlash(path)
	body, err := embeddedFiles.ReadFile(fullPath)
	if err != nil {
		if _, statErr := fs.Stat(embeddedFiles, fullPath); statErr != nil {
			http.NotFound(w, r)
			return
		}
	}
	if ctype := mime.TypeByExtension(filepath.Ext(path)); ctype != "" {
		w.Header().Set("content-type", ctype)
	}
	w.Header().Set("cache-control", "no-store")
	w.Header().Set("x-ruopenray-version", appVersion)
	if path == "index.html" {
		versionQuery := "?v=" + strings.NewReplacer(" ", "-", "\"", "", "'", "").Replace(appVersion)
		text := string(body)
		text = strings.ReplaceAll(text, `href="/styles.css"`, `href="/styles.css`+versionQuery+`"`)
		text = strings.ReplaceAll(text, `src="/app.js"`, `src="/app.js`+versionQuery+`"`)
		body = []byte(text)
	}
	_, _ = w.Write(body)
}
