package main

import (
	"net/http"
	"os"
	"path/filepath"
	"strconv"

	"github.com/AceAsket/RuOpenRay-Keenetic/internal/geodata"
)

func (s *serverState) downloadGeoDat(w http.ResponseWriter, r *http.Request) {
	name := geodata.CleanFileName(r.URL.Query().Get("file"))
	if name == "" {
		writeJSON(w, http.StatusBadRequest, map[string]any{"ok": false, "error": "Выберите dat-файл для скачивания"})
		return
	}
	path := filepath.Join(s.cfg.GeoDir, name)
	info, err := os.Stat(path)
	if err != nil || info.IsDir() {
		writeJSON(w, http.StatusNotFound, map[string]any{"ok": false, "error": name + ": файл не найден"})
		return
	}
	w.Header().Set("content-type", "application/octet-stream")
	w.Header().Set("content-length", strconv.FormatInt(info.Size(), 10))
	w.Header().Set("content-disposition", `attachment; filename="`+name+`"`)
	w.Header().Set("cache-control", "no-store")
	http.ServeFile(w, r, path)
}
