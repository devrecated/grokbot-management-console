package main

// End-to-end test of `grugbot init` against a fake Vercel API and a real Postgres.
// GRUGBOT_TEST_DB=postgres://... go test ./...   (skipped without it)

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"sync"
	"testing"
)

type fake struct {
	mu      sync.Mutex
	calls   []string
	env     map[string]string
	bypass  string
	sso     bool
	files   int
	host    string
	project bool
}

func (f *fake) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if r.Header.Get("Authorization") != "Bearer test-token-0123456789abcdef" && !strings.HasPrefix(r.URL.Path, "/app") {
		w.WriteHeader(403)
		return
	}
	f.calls = append(f.calls, r.Method+" "+r.URL.Path)
	body, _ := io.ReadAll(r.Body)
	js := func(s string) { w.Header().Set("content-type", "application/json"); io.WriteString(w, s) }
	switch {
	case r.URL.Path == "/app/":
		w.WriteHeader(401) // Vercel Authentication wall
	case r.URL.Path == "/app/api/logs":
		if r.Header.Get("x-vercel-protection-bypass") != f.bypass {
			w.WriteHeader(401)
			return
		}
		js(`{"rows":[]}`)
	case r.URL.Path == "/v2/user":
		js(`{"user":{"username":"tester"}}`)
	case r.URL.Path == "/v2/teams":
		js(`{"teams":[{"id":"team_x","slug":"acme","name":"Acme"}]}`)
	case r.Method == "GET" && r.URL.Path == "/v9/projects/grug-test" && !f.project:
		w.WriteHeader(404)
	case r.Method == "GET" && strings.HasPrefix(r.URL.Path, "/v9/projects/"):
		js(`{"id":"prj_1","name":"grug-test","targets":{"production":{"alias":["` + f.host + `/app"]}}}`)
	case r.URL.Path == "/v11/projects":
		f.project = true
		js(`{"id":"prj_1","name":"grug-test"}`)
	case strings.HasSuffix(r.URL.Path, "/env"):
		var l []map[string]any
		json.Unmarshal(body, &l)
		for _, e := range l {
			f.env[e["key"].(string)] = e["value"].(string)
		}
		js(`{}`)
	case r.URL.Path == "/v9/projects/prj_1" && r.Method == "PATCH":
		f.sso = strings.Contains(string(body), "all_except_custom_domains")
		js(`{}`)
	case strings.HasSuffix(r.URL.Path, "/protection-bypass"):
		var b struct{ Generate struct{ Secret string } }
		json.Unmarshal(body, &b)
		f.bypass = b.Generate.Secret
		js(`{}`)
	case r.URL.Path == "/v2/files":
		f.files++
		js(`{}`)
	case r.URL.Path == "/v13/deployments":
		js(`{"id":"dpl_1","url":"x","readyState":"BUILDING"}`)
	case r.URL.Path == "/v13/deployments/dpl_1":
		js(`{"id":"dpl_1","url":"x","readyState":"READY"}`)
	default:
		w.WriteHeader(404)
	}
}

func TestInitOwnPostgres(t *testing.T) {
	dsn := os.Getenv("GRUGBOT_TEST_DB")
	if dsn == "" {
		t.Skip("GRUGBOT_TEST_DB not set")
	}
	f := &fake{env: map[string]string{}}
	srv := httptest.NewServer(f)
	defer srv.Close()
	f.host = strings.TrimPrefix(srv.URL, "http://")
	dir := t.TempDir()
	t.Setenv("VERCEL_API_URL", srv.URL)
	t.Setenv("GRUGBOT_HOME", dir)
	t.Setenv("VERCEL_TOKEN", "test-token-0123456789abcdef")
	o := flags("init", []string{"--yes", "--project", "grug-test", "--db", "own", "--database-url", dsn, "--source", ".."})
	t.Setenv("GRUGBOT_TEST_HTTP", "1")
	if err := cmdInit(o); err != nil {
		t.Fatal(err)
	}
	if f.env["DATABASE_URL"] != dsn || len(f.env["ROUTINE_LOG_TOKEN"]) != 40 {
		t.Fatalf("env not set right: keys=%v", keys(f.env))
	}
	if !f.sso || len(f.bypass) != 32 || f.files < 20 {
		t.Fatalf("sso=%v bypass=%d files=%d", f.sso, len(f.bypass), f.files)
	}
	for _, p := range []string{cfgPath(), boxEnvPath(), dbEnvPath()} {
		st, err := os.Stat(p)
		if err != nil || st.Mode().Perm() != 0o600 {
			t.Fatalf("%s: %v %v", p, err, st)
		}
	}
	env := readEnvFile(boxEnvPath())
	if env["ROUTINE_LOG_TOKEN"] != f.env["ROUTINE_LOG_TOKEN"] || env["VERCEL_BYPASS"] != f.bypass {
		t.Fatal("box.env does not match what was set on Vercel")
	}
	t.Logf("%d API calls", len(f.calls))
}
