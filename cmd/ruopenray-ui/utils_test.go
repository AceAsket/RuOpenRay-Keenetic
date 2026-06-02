package main

import "testing"

func TestNumberParsesJSONFloat(t *testing.T) {
	if got := number(float64(8978567), 0); got != 8978567 {
		t.Fatalf("number(float64) = %d", got)
	}
	if got := numberAny("8.978567e+06"); got != 8978567 {
		t.Fatalf("numberAny(scientific string) = %d", got)
	}
}
