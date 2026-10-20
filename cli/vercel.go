package main

// Thin Vercel REST client. Only the calls grugbot needs. VERCEL_API_URL overrides the base (tests use a fake server).
// In dry-run mode nothing leaves the machine: every call is printed and answered with a canned response.

import (
	"bytes"
	"crypto/sha1"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"
)

type Vercel struct {
	Base, Token, TeamID string
	DryRun, DryExisting bool
	HTTP                *http.Client
	Log                 func(string)
}

type APIError struct {
	Status int
	Body   string
}

func (e *APIError) Error() string { return fmt.Sprintf("vercel api %d: %s", e.Status, e.Body) }

func NewVercel(token string, dry bool) *Vercel {
	b := os.Getenv("VERCEL_API_URL")
	if b == "" {
		b = "https://api.vercel.com"
	}
	return &Vercel{Base: strings.TrimRight(b, "/"), Token: token, DryRun: dry, HTTP: &http.Client{Timeout: 60 * time.Second}, Log: func(string) {}}
}

func (v *Vercel) url(path string) string {
	u := v.Base + path
	if v.TeamID != "" {
		sep := "?"
		if strings.Contains(path, "?") {
			sep = "&"
		}
		u += sep + "teamId=" + url.QueryEscape(v.TeamID)
	}
	return u
}

// do sends JSON (or raw bytes when body is []byte) and decodes the JSON answer into out.
func (v *Vercel) do(method, path string, body any, out any, hdr map[string]string) error {
	if v.DryRun {
		v.Log(fmt.Sprintf("[dry-run] %s %s", method, path))
		if out == nil {
			return nil
		}
		return json.Unmarshal(dryAnswer(method, path), out)
	}
	var rd io.Reader
	ct := "application/json"
	switch b := body.(type) {
	case nil:
	case []byte:
		rd, ct = bytes.NewReader(b), "application/octet-stream"
	default:
		j, _ := json.Marshal(b)
		rd = bytes.NewReader(j)
	}
	req, _ := http.NewRequest(method, v.url(path), rd)
	req.Header.Set("Authorization", "Bearer "+v.Token)
	if rd != nil {
		req.Header.Set("Content-Type", ct)
	}
	for k, x := range hdr {
		req.Header.Set(k, x)
	}
	res, err := v.HTTP.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	raw, _ := io.ReadAll(res.Body)
	if res.StatusCode >= 300 {
		return &APIError{res.StatusCode, redact(string(raw), v.Token)}
	}
	if out != nil && len(raw) > 0 {
		return json.Unmarshal(raw, out)
	}
	return nil
}

func redact(s, secret string) string {
	if secret != "" {
		s = strings.ReplaceAll(s, secret, "[redacted]")
	}
	if len(s) > 300 {
		s = s[:300]
	}
	return s
}

type User struct {
	User struct{ Username, Email string } `json:"user"`
}
type Team struct{ ID, Slug, Name string }
type Project struct {
	ID, Name string
	Targets  struct {
		Production *struct {
			Alias []string `json:"alias"`
		} `json:"production"`
	} `json:"targets"`
	SSO *struct {
		DeploymentType string `json:"deploymentType"`
	} `json:"ssoProtection"`
}
type EnvVar struct{ ID, Key string }
type Deployment struct {
	ID, URL    string
	ReadyState string `json:"readyState"`
}

func (v *Vercel) Me() (User, error) { var u User; return u, v.do("GET", "/v2/user", nil, &u, nil) }
func (v *Vercel) Teams() ([]Team, error) {
	var r struct{ Teams []Team }
	return r.Teams, v.do("GET", "/v2/teams", nil, &r, nil)
}
func (v *Vercel) GetProject(name string) (*Project, error) {
	if v.DryRun && !v.DryExisting {
		v.Log("[dry-run] GET /v9/projects/" + name + " (pretend: not found)")
		return nil, nil
	}
	var p Project
	err := v.do("GET", "/v9/projects/"+url.PathEscape(name), nil, &p, nil)
	if e, ok := err.(*APIError); ok && e.Status == 404 {
		return nil, nil
	}
	return &p, err
}
func (v *Vercel) CreateProject(name string) (*Project, error) {
	var p Project
	return &p, v.do("POST", "/v11/projects", map[string]any{"name": name, "framework": "nextjs"}, &p, nil)
}
func (v *Vercel) DeleteProject(id string) error {
	return v.do("DELETE", "/v9/projects/"+id, nil, nil, nil)
}

// SetEnv upserts encrypted env vars for production and preview.
func (v *Vercel) SetEnv(projectID string, kv map[string]string) error {
	var list []map[string]any
	for k, x := range kv {
		list = append(list, map[string]any{"key": k, "value": x, "type": "encrypted", "target": []string{"production", "preview"}})
	}
	return v.do("POST", "/v10/projects/"+projectID+"/env?upsert=true", list, nil, nil)
}
func (v *Vercel) EnvKeys(projectID string) ([]string, error) {
	var r struct{ Envs []EnvVar }
	err := v.do("GET", "/v9/projects/"+projectID+"/env", nil, &r, nil)
	var keys []string
	for _, e := range r.Envs {
		keys = append(keys, e.Key)
	}
	return keys, err
}

// Protect turns on Vercel Authentication (team login) for every deployment URL.
func (v *Vercel) Protect(projectID string) error {
	return v.do("PATCH", "/v9/projects/"+projectID, map[string]any{"ssoProtection": map[string]string{"deploymentType": "all_except_custom_domains"}}, nil, nil)
}

// AddBypass registers our own random secret as a Protection Bypass for Automation, so the box can reach the API.
func (v *Vercel) AddBypass(projectID, secret string) error {
	return v.do("PATCH", "/v1/projects/"+projectID+"/protection-bypass", map[string]any{"generate": map[string]string{"secret": secret, "note": "grugbot box"}}, nil, nil)
}

func (v *Vercel) Upload(data []byte) (string, error) {
	h := sha1.Sum(data)
	sum := hex.EncodeToString(h[:])
	return sum, v.do("POST", "/v2/files", data, nil, map[string]string{"x-vercel-digest": sum})
}

type File struct {
	File string `json:"file"`
	Sha  string `json:"sha"`
	Size int    `json:"size"`
}

func (v *Vercel) Deploy(name, projectID string, files []File) (Deployment, error) {
	var d Deployment
	return d, v.do("POST", "/v13/deployments?forceNew=1", map[string]any{"name": name, "project": projectID, "target": "production", "files": files,
		"projectSettings": map[string]any{"framework": "nextjs"}}, &d, nil)
}
func (v *Vercel) Deployment(id string) (Deployment, error) {
	var d Deployment
	return d, v.do("GET", "/v13/deployments/"+id, nil, &d, nil)
}
func (v *Vercel) LatestDeployment(projectID string) (*Deployment, error) {
	var r struct {
		Deployments []struct {
			UID   string `json:"uid"`
			URL   string `json:"url"`
			State string `json:"state"`
		}
	}
	if err := v.do("GET", "/v6/deployments?limit=1&target=production&projectId="+projectID, nil, &r, nil); err != nil || len(r.Deployments) == 0 {
		return nil, err
	}
	d := r.Deployments[0]
	return &Deployment{ID: d.UID, URL: d.URL, ReadyState: d.State}, nil
}

func dryAnswer(method, path string) []byte {
	p := strings.SplitN(path, "?", 2)[0]
	switch {
	case p == "/v2/user":
		return []byte(`{"user":{"username":"dry-run-user"}}`)
	case p == "/v2/teams":
		return []byte(`{"teams":[{"id":"team_dryrun","slug":"my-team","name":"My Team"}]}`)
	case method == "GET" && strings.HasPrefix(p, "/v9/projects/") && strings.HasSuffix(p, "/env"):
		return []byte(`{"envs":[{"key":"DATABASE_URL"},{"key":"ROUTINE_LOG_TOKEN"}]}`)
	case method == "GET" && strings.HasPrefix(p, "/v9/projects/"):
		return []byte(`{"id":"prj_dryrun","name":"grugbot-console","ssoProtection":{"deploymentType":"all_except_custom_domains"}}`)
	case strings.HasPrefix(p, "/v11/projects"):
		return []byte(`{"id":"prj_dryrun","name":"grugbot-console"}`)
	case strings.HasPrefix(p, "/v13/deployments"):
		return []byte(`{"id":"dpl_dryrun","url":"grugbot-console-dryrun.vercel.app","readyState":"READY"}`)
	case strings.HasPrefix(p, "/v6/deployments"):
		return []byte(`{"deployments":[{"uid":"dpl_dryrun","url":"grugbot-console-dryrun.vercel.app","state":"READY"}]}`)
	}
	return []byte(`{}`)
}
