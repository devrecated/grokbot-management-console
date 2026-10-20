package fakevercel

import (
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"sync"
	"time"
)

// Server is a tiny in-memory stand-in for the Vercel REST API plus the deployed app,
// used by the tests and by the docs/init.tape recording. Any token starting with fake_ is accepted.
type Server struct {
	mu      sync.Mutex
	Calls   []string
	Env     map[string]string
	Bypass  string
	SSO     bool
	Files   int
	Alias   string
	project bool
}

func (f *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if !strings.HasPrefix(r.Header.Get("Authorization"), "Bearer fake_") && r.URL.Path != "/" && r.URL.Path != "/api/logs" {
		w.WriteHeader(403)
		return
	}
	f.Calls = append(f.Calls, r.Method+" "+r.URL.Path)
	body, _ := io.ReadAll(r.Body)
	js := func(s string) { w.Header().Set("content-type", "application/json"); io.WriteString(w, s) }
	switch {
	case r.URL.Path == "/":
		w.WriteHeader(401) // Vercel Authentication wall
	case r.URL.Path == "/api/logs":
		if r.Header.Get("x-vercel-protection-bypass") != f.Bypass {
			w.WriteHeader(401)
			return
		}
		js(`{"rows":[]}`)
	case r.URL.Path == "/v2/user":
		js(`{"user":{"username":"tester"}}`)
	case r.URL.Path == "/v2/teams":
		js(`{"teams":[{"id":"team_fake1","slug":"acme","name":"Acme Rocks"},{"id":"team_fake2","slug":"grug-cave","name":"Grug Cave"}]}`)
	case r.Method == "GET" && !f.project && !strings.HasSuffix(r.URL.Path, "/env") && !strings.HasPrefix(r.URL.Path, "/v9/projects/prj_"):
		w.WriteHeader(404)
	case r.Method == "GET" && strings.HasPrefix(r.URL.Path, "/v9/projects/"):
		js(`{"id":"prj_1","name":"grugbot-console","ssoProtection":{"deploymentType":"all_except_custom_domains"},"targets":{"production":{"alias":["` + f.Alias + `"]}}}`)
	case r.URL.Path == "/v11/projects":
		f.project = true
		js(`{"id":"prj_1","name":"grugbot-console"}`)
	case strings.HasSuffix(r.URL.Path, "/env"):
		var l []map[string]any
		json.Unmarshal(body, &l)
		for _, e := range l {
			f.Env[e["key"].(string)] = e["value"].(string)
		}
		js(`{}`)
	case r.URL.Path == "/v9/projects/prj_1" && r.Method == "PATCH":
		f.SSO = strings.Contains(string(body), "all_except_custom_domains")
		js(`{}`)
	case strings.HasSuffix(r.URL.Path, "/protection-bypass"):
		var b struct{ Generate struct{ Secret string } }
		json.Unmarshal(body, &b)
		f.Bypass = b.Generate.Secret
		js(`{}`)
	case r.URL.Path == "/v2/files":
		f.Files++
		js(`{}`)
	case r.URL.Path == "/v13/deployments":
		time.Sleep(1200 * time.Millisecond)
		js(`{"id":"dpl_fake","url":"` + f.Alias + `","readyState":"BUILDING"}`)
	case r.URL.Path == "/v13/deployments/dpl_fake":
		js(`{"id":"dpl_fake","url":"` + f.Alias + `","readyState":"READY"}`)
	default:
		w.WriteHeader(404)
	}
}

func New(alias string) *Server { return &Server{Env: map[string]string{}, Alias: alias} }
