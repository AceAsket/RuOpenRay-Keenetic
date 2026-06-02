package main

import (
	"context"
	"fmt"
	"os/exec"
	"strings"
	"time"
)

func run(name string, args ...string) map[string]any {
	cmd := exec.Command(name, args...)
	out, err := cmd.CombinedOutput()
	stdout := cleanCommandStdout(string(out))
	result := map[string]any{"ok": err == nil, "code": 0, "stdout": stdout, "stderr": "", "message": ""}
	if err != nil {
		result["message"] = err.Error()
		result["stderr"] = err.Error()
	}
	return result
}

func runTimeout(timeout time.Duration, name string, args ...string) map[string]any {
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()
	cmd := exec.CommandContext(ctx, name, args...)
	out, err := cmd.CombinedOutput()
	stdout := cleanCommandStdout(string(out))
	result := map[string]any{"ok": err == nil, "code": 0, "stdout": stdout, "stderr": "", "message": ""}
	if ctx.Err() == context.DeadlineExceeded {
		result["ok"] = false
		result["stderr"] = "команда превысила лимит времени"
		result["message"] = ctx.Err().Error()
		return result
	}
	if err != nil {
		result["message"] = err.Error()
		result["stderr"] = err.Error()
	}
	return result
}

func cleanCommandStdout(output string) string {
	lines := []string{}
	for _, line := range strings.Split(output, "\n") {
		clean := strings.TrimSpace(line)
		if clean == "" {
			continue
		}
		if strings.Contains(clean, "ubus call service delete") && strings.Contains(clean, "(Not found)") {
			continue
		}
		lines = append(lines, clean)
	}
	return strings.TrimSpace(strings.Join(lines, "\n"))
}

func concatCommandOutput(items ...map[string]any) string {
	var lines []string
	for _, item := range items {
		if item == nil {
			continue
		}
		if stdout := strings.TrimSpace(fmt.Sprint(item["stdout"])); stdout != "" && stdout != "<nil>" {
			lines = append(lines, stdout)
		}
		if stderr := strings.TrimSpace(fmt.Sprint(item["stderr"])); stderr != "" && stderr != "<nil>" {
			lines = append(lines, stderr)
		}
	}
	return strings.Join(lines, "\n\n")
}
