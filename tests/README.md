# Tests

This directory is reserved for integration and end-to-end checks that do not belong to a single Go package.

Current Go unit tests stay next to the files they cover. When backend code moves into `internal/...` packages, package tests should move with those packages, while router/OpenWrt smoke tests can live here.
