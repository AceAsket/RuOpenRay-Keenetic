package geodata

import "testing"

func TestCleanScheduleTime(t *testing.T) {
	hour, minute := CleanScheduleTime("23:59")
	if hour != 23 || minute != 59 {
		t.Fatalf("CleanScheduleTime returned %02d:%02d", hour, minute)
	}
	hour, minute = CleanScheduleTime("99:99")
	if hour != 4 || minute != 20 {
		t.Fatalf("invalid time should fall back to 04:20, got %02d:%02d", hour, minute)
	}
}

func TestCleanWeekday(t *testing.T) {
	if got := CleanWeekday("6"); got != 6 {
		t.Fatalf("CleanWeekday(6) = %d", got)
	}
	if got := CleanWeekday("9"); got != 0 {
		t.Fatalf("invalid weekday should fall back to 0, got %d", got)
	}
}

func TestShellQuote(t *testing.T) {
	if got := ShellQuote("a'b"); got != `'a'"'"'b'` {
		t.Fatalf("unexpected shell quote: %s", got)
	}
}
