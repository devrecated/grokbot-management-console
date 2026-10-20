package main

// End-to-end test of `grugbot init` against the fake Vercel API and a real Postgres.
// GRUGBOT_TEST_DB=postgres://... go test ./...   (skipped without it)

import (
	"net/http/httptest"
	"os"
	"testing"

	"github.com/OWNER/grokbot-routines/cli/fakevercel"
)

func TestInitOwnPostgres(t *testing.T) {
	dsn := os.Getenv("GRUGBOT_TEST_DB")
	if dsn == "" {
		t.Skip("GRUGBOT_TEST_DB not set")
	}
	f := fakevercel.New("grugbot-console.vercel.app")
	srv := httptest.NewServer(f)
	defer srv.Close()
	t.Setenv("VERCEL_API_URL", srv.URL)
	t.Setenv("GRUGBOT_TEST_ORIGIN", srv.URL)
	t.Setenv("GRUGBOT_HOME", t.TempDir())
	t.Setenv("VERCEL_TOKEN", "fake_test_token_0123456789")
	o := flags("init", []string{"--yes", "--team", "acme", "--project", "grug-test", "--db", "own", "--database-url", dsn, "--source", ".."})
	if err := cmdInit(o); err != nil {
		t.Fatal(err)
	}
	if f.Env["DATABASE_URL"] != dsn || len(f.Env["ROUTINE_LOG_TOKEN"]) != 40 {
		t.Fatalf("env not set right: keys=%v", f.Env)
	}
	if !f.SSO || len(f.Bypass) != 32 || f.Files < 20 {
		t.Fatalf("sso=%v bypass=%d files=%d", f.SSO, len(f.Bypass), f.Files)
	}
	for _, p := range []string{cfgPath(), boxEnvPath(), dbEnvPath()} {
		st, err := os.Stat(p)
		if err != nil || st.Mode().Perm() != 0o600 {
			t.Fatalf("%s: %v %v", p, err, st)
		}
	}
	env := readEnvFile(boxEnvPath())
	if env["ROUTINE_LOG_TOKEN"] != f.Env["ROUTINE_LOG_TOKEN"] || env["VERCEL_BYPASS"] != f.Bypass {
		t.Fatal("box.env does not match what was set on Vercel")
	}
}
