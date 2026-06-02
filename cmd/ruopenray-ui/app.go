package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"time"

	rsystem "github.com/AceAsket/RuOpenRay-Keenetic/internal/system"
)

func main() {
	cfg := loadAppConfig()
	state := &serverState{cfg: cfg, sessions: map[string]bool{}, started: time.Now(), systemSampler: rsystem.NewSampler()}
	if err := state.ensureData(); err != nil {
		log.Fatal(err)
	}
	state.startLogMaintenance()
	if len(os.Args) > 1 && os.Args[1] == "--geo-update-scheduled" {
		payload := state.runScheduledGeoUpdate()
		body, _ := json.MarshalIndent(payload, "", "  ")
		fmt.Println(string(body))
		return
	}
	if len(os.Args) > 1 && os.Args[1] == "--route-presets-update-scheduled" {
		payload := state.runScheduledRoutePresetSourceUpdate()
		body, _ := json.MarshalIndent(payload, "", "  ")
		fmt.Println(string(body))
		return
	}
	if len(os.Args) > 1 && os.Args[1] != "serve" {
		os.Exit(state.runCLI(os.Args[1:]))
	}
	mux := http.NewServeMux()
	mux.HandleFunc("/api/", state.handleAPI)
	mux.HandleFunc("/", state.handleStatic)
	addr := cfg.Host + ":" + cfg.Port
	log.Printf("RuOpenRay UI слушает http://%s", addr)
	server := &http.Server{
		Addr:              addr,
		Handler:           mux,
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       30 * time.Second,
		WriteTimeout:      120 * time.Second,
		IdleTimeout:       60 * time.Second,
		MaxHeaderBytes:    16 * 1024,
	}
	log.Fatal(server.ListenAndServe())
}
