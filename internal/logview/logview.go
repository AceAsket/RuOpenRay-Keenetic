package logview

import (
	"errors"
	"io"
	"os"
	"regexp"
	"sort"
	"strings"
	"time"
)

var lineTimePattern = regexp.MustCompile(`\d{4}/\d{2}/\d{2} \d{2}:\d{2}:\d{2}(?:\.\d+)?`)

type FilterOptions struct {
	Search       string
	Level        string
	Sort         string
	Limit        int
	EmptyMessage string
}

func TailFile(path string, maxLines int) (string, error) {
	file, err := os.Open(path)
	if err != nil {
		return "", err
	}
	defer file.Close()
	info, err := file.Stat()
	if err != nil {
		return "", err
	}
	size := info.Size()
	if size <= 0 {
		return "", nil
	}
	if maxLines <= 0 {
		maxLines = 320
	}
	const chunkSize int64 = 32 * 1024
	chunks := [][]byte{}
	newlines := 0
	for offset := size; offset > 0 && newlines <= maxLines; {
		readSize := chunkSize
		if offset < readSize {
			readSize = offset
		}
		offset -= readSize
		buf := make([]byte, readSize)
		n, err := file.ReadAt(buf, offset)
		if err != nil && !errors.Is(err, io.EOF) {
			return "", err
		}
		buf = buf[:n]
		for _, b := range buf {
			if b == '\n' {
				newlines++
			}
		}
		chunks = append(chunks, buf)
	}
	var builder strings.Builder
	for i := len(chunks) - 1; i >= 0; i-- {
		builder.Write(chunks[i])
	}
	return LastLines(builder.String(), maxLines), nil
}

func LastLines(text string, maxLines int) string {
	if maxLines <= 0 {
		return text
	}
	lines := strings.Split(text, "\n")
	if len(lines) <= maxLines {
		return text
	}
	return strings.Join(lines[len(lines)-maxLines:], "\n")
}

type line struct {
	text  string
	when  int64
	index int
}

func FilterLines(content string, options FilterOptions) string {
	search := strings.ToLower(strings.TrimSpace(options.Search))
	level := strings.ToLower(strings.TrimSpace(options.Level))
	sortOrder := strings.ToLower(strings.TrimSpace(options.Sort))
	limit := options.Limit
	if limit <= 0 {
		limit = 240
	}
	lines := strings.Split(content, "\n")
	var filtered []line
	for index, item := range lines {
		if strings.TrimSpace(item) == "" {
			continue
		}
		lower := strings.ToLower(item)
		if search != "" && !strings.Contains(lower, search) {
			continue
		}
		if level != "" && level != "all" && !strings.Contains(lower, level) {
			continue
		}
		filtered = append(filtered, line{text: item, when: ParseLineTime(item), index: index})
	}
	sort.SliceStable(filtered, func(i, j int) bool {
		left := filtered[i]
		right := filtered[j]
		if left.when == right.when {
			return left.index > right.index
		}
		if left.when == 0 {
			return false
		}
		if right.when == 0 {
			return true
		}
		return left.when > right.when
	})
	if len(filtered) > limit {
		filtered = filtered[:limit]
	}
	if sortOrder != "desc" {
		sort.SliceStable(filtered, func(i, j int) bool {
			left := filtered[i]
			right := filtered[j]
			if left.when == right.when {
				return left.index < right.index
			}
			if left.when == 0 {
				return true
			}
			if right.when == 0 {
				return false
			}
			return left.when < right.when
		})
	}
	if len(filtered) == 0 {
		if options.EmptyMessage != "" {
			return options.EmptyMessage
		}
		return "No log lines matched the selected filters."
	}
	out := make([]string, len(filtered))
	for index, item := range filtered {
		out[index] = item.text
	}
	return strings.Join(out, "\n")
}

func ParseLineTime(raw string) int64 {
	if match := lineTimePattern.FindString(raw); match != "" {
		for _, layout := range []string{"2006/01/02 15:04:05.999999", "2006/01/02 15:04:05"} {
			if ts, err := time.ParseInLocation(layout, match, time.Local); err == nil {
				return ts.UnixNano()
			}
		}
	}
	if len(raw) >= 24 {
		if ts, err := time.ParseInLocation("Mon Jan _2 15:04:05 2006", raw[:24], time.Local); err == nil {
			return ts.UnixNano()
		}
	}
	return 0
}
