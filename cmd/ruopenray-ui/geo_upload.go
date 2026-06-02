package main

import (
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/AceAsket/RuOpenRay-Keenetic/internal/geodata"
)

const maxGeoUploadBytes = 128 * 1024 * 1024

func (s *serverState) uploadGeoFile(r *http.Request) map[string]any {
	if err := r.ParseMultipartForm(maxGeoUploadBytes); err != nil {
		return map[string]any{"ok": false, "stderr": "Не удалось прочитать загружаемый файл: " + err.Error(), "status": s.geoStatus()}
	}
	file, header, err := r.FormFile("file")
	if err != nil {
		return map[string]any{"ok": false, "stderr": "Выберите dat-файл для загрузки", "status": s.geoStatus()}
	}
	defer file.Close()
	if !strings.HasSuffix(strings.ToLower(header.Filename), ".dat") {
		return map[string]any{"ok": false, "stderr": "Можно загрузить только файл с расширением .dat", "status": s.geoStatus()}
	}

	target, err := geoUploadTarget(r, header.Filename)
	if err != nil {
		return map[string]any{"ok": false, "stderr": err.Error(), "status": s.geoStatus()}
	}
	if err := os.MkdirAll(s.cfg.GeoDir, 0o755); err != nil {
		return map[string]any{"ok": false, "stderr": err.Error(), "status": s.geoStatus()}
	}
	targetPath := filepath.Join(s.cfg.GeoDir, target)
	backup := formBool(r, "backup", false)
	if backup {
		if err := s.backupGeoDat(target, targetPath); err != nil {
			return map[string]any{"ok": false, "stderr": err.Error(), "status": s.geoStatus()}
		}
	}
	temp, err := os.CreateTemp(s.cfg.GeoDir, "."+target+".upload-*")
	if err != nil {
		return map[string]any{"ok": false, "stderr": err.Error(), "status": s.geoStatus()}
	}
	tempPath := temp.Name()
	written, copyErr := io.Copy(temp, io.LimitReader(file, maxGeoUploadBytes+1))
	closeErr := temp.Close()
	if copyErr != nil {
		_ = os.Remove(tempPath)
		return map[string]any{"ok": false, "stderr": copyErr.Error(), "status": s.geoStatus()}
	}
	if closeErr != nil {
		_ = os.Remove(tempPath)
		return map[string]any{"ok": false, "stderr": closeErr.Error(), "status": s.geoStatus()}
	}
	if written > maxGeoUploadBytes {
		_ = os.Remove(tempPath)
		return map[string]any{"ok": false, "stderr": "Файл больше 128 MB. Для экономного режима лучше использовать более компактный DAT.", "status": s.geoStatus()}
	}
	if written == 0 {
		_ = os.Remove(tempPath)
		return map[string]any{"ok": false, "stderr": "Загруженный dat-файл пустой", "status": s.geoStatus()}
	}
	if err := os.Rename(tempPath, targetPath); err != nil {
		_ = os.Remove(tempPath)
		return map[string]any{"ok": false, "stderr": err.Error(), "status": s.geoStatus()}
	}
	restart := map[string]any{"ok": true, "stdout": ""}
	ok := true
	if formBool(r, "restart", true) {
		restart = s.serviceAction("restart")
		ok = restart["ok"] == true
	}
	stdout := fmt.Sprintf("%s загружен: %s", target, byteCount(written))
	if source := strings.TrimSpace(header.Filename); source != "" {
		stdout = fmt.Sprintf("%s\nисходный файл: %s", stdout, source)
	}
	if restartText := strings.TrimSpace(fmt.Sprint(restart["stdout"])); restartText != "" && restartText != "<nil>" {
		stdout = strings.TrimSpace(stdout + "\n" + restartText)
	}
	stderr := ""
	if !ok {
		stderr = strings.TrimSpace(fmt.Sprint(restart["stderr"]))
		if stderr == "" || stderr == "<nil>" {
			stderr = "dat-файл загружен, но Xray не перезапустился"
		}
	}
	return map[string]any{
		"ok":      ok,
		"file":    target,
		"size":    written,
		"backup":  backup,
		"restart": restart,
		"status":  s.geoStatus(),
		"stdout":  stdout,
		"stderr":  stderr,
	}
}

func geoUploadTarget(r *http.Request, uploadedName string) (string, error) {
	mode := strings.ToLower(strings.TrimSpace(formValue(r, "target")))
	switch mode {
	case "", "geosite":
		return "geosite.dat", nil
	case "geoip":
		return "geoip.dat", nil
	case "custom", "extra", "separate":
		name := geodata.CleanTarget(formValue(r, "name"))
		if name == "" {
			name = geodata.CleanFileName(uploadedName)
		}
		if name == "" || name == "geoip.dat" || name == "geosite.dat" {
			return "", fmt.Errorf("Для отдельного DAT задайте имя файла, например my-source.dat")
		}
		return name, nil
	default:
		return "", fmt.Errorf("Неизвестный тип сохранения DAT: %s", mode)
	}
}

func (s *serverState) backupGeoDat(name string, targetPath string) error {
	current, err := os.ReadFile(targetPath)
	if err != nil || len(current) == 0 {
		return nil
	}
	if err := os.MkdirAll(s.cfg.BackupDir, 0o755); err != nil {
		return err
	}
	backup := filepath.Join(s.cfg.BackupDir, name+"-"+time.Now().Format("20060102-150405"))
	return os.WriteFile(backup, current, 0o644)
}

func formBool(r *http.Request, key string, fallback bool) bool {
	clean := strings.ToLower(strings.TrimSpace(formValue(r, key)))
	if clean == "" {
		return fallback
	}
	return clean == "1" || clean == "true" || clean == "yes" || clean == "on"
}

func formValue(r *http.Request, key string) string {
	if r == nil {
		return ""
	}
	if r.PostForm != nil {
		if value := r.PostForm.Get(key); value != "" {
			return value
		}
	}
	if r.Form != nil {
		if value := r.Form.Get(key); value != "" {
			return value
		}
	}
	return r.FormValue(key)
}
