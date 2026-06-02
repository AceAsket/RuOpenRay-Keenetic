package geodata

import (
	"strconv"
	"strings"
)

func CleanScheduleTime(value string) (int, int) {
	hour, minute := 4, 20
	parts := strings.Split(value, ":")
	if len(parts) == 2 {
		hour = number(parts[0], hour)
		minute = number(parts[1], minute)
	}
	if hour < 0 || hour > 23 {
		hour = 4
	}
	if minute < 0 || minute > 59 {
		minute = 20
	}
	return hour, minute
}

func CleanWeekday(value string) int {
	weekday := number(value, 0)
	if weekday < 0 || weekday > 6 {
		return 0
	}
	return weekday
}

func ShellQuote(value string) string {
	return "'" + strings.ReplaceAll(value, "'", "'\"'\"'") + "'"
}

func number(value string, fallback int) int {
	clean := strings.TrimSpace(value)
	if clean == "" {
		return fallback
	}
	parsed, err := strconv.Atoi(clean)
	if err != nil {
		return fallback
	}
	return parsed
}
