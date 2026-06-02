package main

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"time"
)

const maxStoredSubscriptionCandidateChecks = 512

type subscriptionCandidateCheckResultsStore struct {
	UpdatedAt string                               `json:"updatedAt"`
	Pools     map[string]map[string]map[string]any `json:"pools"`
}

func (s *serverState) subscriptionCandidateCheckResultsPath() string {
	return filepath.Join(s.cfg.DataDir, "checks", "subscription-candidates.json")
}

func (s *serverState) readSubscriptionCandidateCheckResults() map[string]map[string]map[string]any {
	body, err := os.ReadFile(s.subscriptionCandidateCheckResultsPath())
	if err != nil {
		return map[string]map[string]map[string]any{}
	}
	var store subscriptionCandidateCheckResultsStore
	if err := json.Unmarshal(body, &store); err != nil || store.Pools == nil {
		return map[string]map[string]map[string]any{}
	}
	return store.Pools
}

func (s *serverState) saveSubscriptionCandidateCheckResults(poolTag string, results []map[string]any) error {
	if poolTag == "" || len(results) == 0 {
		return nil
	}
	path := s.subscriptionCandidateCheckResultsPath()
	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return err
	}
	current := s.readSubscriptionCandidateCheckResults()
	pool := current[poolTag]
	if pool == nil {
		pool = map[string]map[string]any{}
	}
	for _, result := range results {
		index := number(result["index"], -1)
		if index < 0 {
			continue
		}
		if stringsTrim(result["checkedAt"]) == "" {
			result["checkedAt"] = time.Now().Format(time.RFC3339)
		}
		pool[fmt.Sprint(index)] = sanitizeSubscriptionCandidateCheckResult(result)
	}
	current[poolTag] = pool
	current = limitSubscriptionCandidateCheckResults(current, maxStoredSubscriptionCandidateChecks)
	store := subscriptionCandidateCheckResultsStore{
		UpdatedAt: time.Now().Format(time.RFC3339),
		Pools:     current,
	}
	body, err := json.MarshalIndent(store, "", "  ")
	if err != nil {
		return err
	}
	tmp, err := os.CreateTemp(dir, ".subscription-candidates-*.json")
	if err != nil {
		return err
	}
	tmpPath := tmp.Name()
	if _, err := tmp.Write(body); err != nil {
		_ = tmp.Close()
		_ = os.Remove(tmpPath)
		return err
	}
	if err := tmp.Close(); err != nil {
		_ = os.Remove(tmpPath)
		return err
	}
	if err := os.Chmod(tmpPath, 0o600); err != nil {
		_ = os.Remove(tmpPath)
		return err
	}
	if err := os.Rename(tmpPath, path); err != nil {
		_ = os.Remove(tmpPath)
		return err
	}
	return nil
}

func sanitizeSubscriptionCandidateCheckResult(result map[string]any) map[string]any {
	allowed := []string{
		"index", "tag", "ok", "skipped", "error", "method", "url", "checkedAt",
		"latencyMs", "httpLatencyMs", "endpointLatencyMs", "pingLatencyMs",
		"httpOk", "endpointOk", "pingOk",
		"protocol", "address", "port", "network", "security",
	}
	clean := map[string]any{}
	for _, key := range allowed {
		if value, ok := result[key]; ok {
			clean[key] = value
		}
	}
	return clean
}

func limitSubscriptionCandidateCheckResults(pools map[string]map[string]map[string]any, limit int) map[string]map[string]map[string]any {
	if limit <= 0 {
		return pools
	}
	type checkItem struct {
		pool  string
		index string
		at    time.Time
	}
	ordered := []checkItem{}
	for poolTag, pool := range pools {
		for index, item := range pool {
			at, _ := time.Parse(time.RFC3339, stringsTrim(item["checkedAt"]))
			ordered = append(ordered, checkItem{pool: poolTag, index: index, at: at})
		}
	}
	if len(ordered) <= limit {
		return pools
	}
	sort.Slice(ordered, func(i, j int) bool {
		return ordered[i].at.After(ordered[j].at)
	})
	keep := map[string]map[string]bool{}
	for i, item := range ordered {
		if i >= limit {
			break
		}
		if keep[item.pool] == nil {
			keep[item.pool] = map[string]bool{}
		}
		keep[item.pool][item.index] = true
	}
	next := map[string]map[string]map[string]any{}
	for poolTag, pool := range pools {
		for index, item := range pool {
			if !keep[poolTag][index] {
				continue
			}
			if next[poolTag] == nil {
				next[poolTag] = map[string]map[string]any{}
			}
			next[poolTag][index] = item
		}
	}
	return next
}
