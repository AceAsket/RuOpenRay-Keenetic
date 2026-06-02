package subscription

import (
	"encoding/json"
	"net/url"
	"os"
	"path/filepath"

	"github.com/AceAsket/RuOpenRay-Keenetic/internal/proxy"
)

type Pool struct {
	Tag        string           `json:"tag"`
	URL        string           `json:"url"`
	Active     int              `json:"active"`
	UpdatedAt  string           `json:"updatedAt"`
	Candidates []map[string]any `json:"candidates"`
}

type Store struct {
	Pools []Pool `json:"pools"`
}

func LoadStore(path string) Store {
	var store Store
	body, err := os.ReadFile(path)
	if err == nil {
		_ = json.Unmarshal(body, &store)
	}
	if store.Pools == nil {
		store.Pools = []Pool{}
	}
	return store
}

func SaveStore(path string, store Store) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	body, err := json.MarshalIndent(store, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, body, 0o600)
}

func MaskURL(rawURL string) string {
	parsed, err := url.Parse(rawURL)
	if err != nil || parsed.User == nil {
		return rawURL
	}
	username := parsed.User.Username()
	if _, hasPassword := parsed.User.Password(); hasPassword {
		parsed.User = url.UserPassword(username, "masked")
	} else {
		parsed.User = url.User(username)
	}
	return parsed.String()
}

func PublicPool(pool Pool) map[string]any {
	candidates := []map[string]any{}
	for _, candidate := range pool.Candidates {
		candidates = append(candidates, proxy.OutboundSummary(candidate))
	}
	active := map[string]any{}
	if pool.Active >= 0 && pool.Active < len(pool.Candidates) {
		active = proxy.OutboundSummary(pool.Candidates[pool.Active])
	}
	return map[string]any{
		"tag": pool.Tag, "url": MaskURL(pool.URL), "active": pool.Active, "updatedAt": pool.UpdatedAt,
		"count": len(pool.Candidates), "activeCandidate": active, "candidates": candidates,
	}
}

func PublicPools(store Store) []map[string]any {
	pools := []map[string]any{}
	for _, pool := range store.Pools {
		pools = append(pools, PublicPool(pool))
	}
	return pools
}

func FindPoolIndex(store Store, tag string) int {
	for index, pool := range store.Pools {
		if pool.Tag == tag {
			return index
		}
	}
	return -1
}

func UpsertPool(store Store, pool Pool) Store {
	for index := range store.Pools {
		if store.Pools[index].Tag == pool.Tag {
			store.Pools[index] = pool
			return store
		}
	}
	store.Pools = append([]Pool{pool}, store.Pools...)
	return store
}

func RemovePool(store Store, tag string) (Store, bool) {
	next := Store{Pools: []Pool{}}
	removed := false
	for _, pool := range store.Pools {
		if pool.Tag == tag {
			removed = true
			continue
		}
		next.Pools = append(next.Pools, pool)
	}
	return next, removed
}

func NormalizeActive(active int, candidates int) int {
	if candidates <= 0 || active < 0 || active >= candidates {
		return 0
	}
	return active
}
