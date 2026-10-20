// grugbot: set up, check, redeploy and remove a GrugBot Console on Vercel.
package main

import (
	"crypto/rand"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"math/big"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/charmbracelet/huh"
)

var version = "dev"

const usage = `grugbot sets up the GrugBot Console on your Vercel account.

  grugbot init        walk through login, database, project and first deploy
  grugbot doctor      check that everything is wired up
  grugbot deploy      deploy the bundled app again (after an upgrade)
  grugbot uninstall   delete the Vercel project and local grugbot files
  grugbot version

Common flags: --dry-run (print API calls, change nothing), --yes (no prompts, needs flags).
Token: VERCEL_TOKEN or a masked prompt. Create one at https://vercel.com/account/tokens
`

type Config struct {
	TeamID    string `json:"team_id"`
	TeamSlug  string `json:"team_slug"`
	ProjectID string `json:"project_id"`
	Project   string `json:"project"`
	URL       string `json:"url"`
}

func home() string {
	if h := os.Getenv("GRUGBOT_HOME"); h != "" {
		return h
	}
	d, _ := os.UserConfigDir()
	return filepath.Join(d, "grugbot")
}
func cfgPath() string    { return filepath.Join(home(), "config.json") }
func boxEnvPath() string { return filepath.Join(home(), "box.env") }
func dbEnvPath() string  { return filepath.Join(home(), "db.env") }

func loadCfg() (Config, error) {
	var c Config
	b, err := os.ReadFile(cfgPath())
	if err != nil {
		return c, fmt.Errorf("no config at %s (run grugbot init first)", cfgPath())
	}
	return c, json.Unmarshal(b, &c)
}
func write600(path string, b []byte) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return err
	}
	if err := os.WriteFile(path, b, 0o600); err != nil {
		return err
	}
	return os.Chmod(path, 0o600)
}
func readEnvFile(path string) map[string]string {
	m := map[string]string{}
	b, _ := os.ReadFile(path)
	for _, l := range strings.Split(string(b), "\n") {
		if i := strings.Index(l, "="); i > 0 {
			m[l[:i]] = l[i+1:]
		}
	}
	return m
}

func randomSecret(n int) string {
	const a = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
	b := make([]byte, n)
	for i := range b {
		x, _ := rand.Int(rand.Reader, big.NewInt(int64(len(a))))
		b[i] = a[x.Int64()]
	}
	return string(b)
}

type opts struct {
	dry, yes                                bool
	team, project, db, dbURL, source, token string
}

func flags(name string, args []string) opts {
	var o opts
	fs := flag.NewFlagSet(name, flag.ExitOnError)
	fs.BoolVar(&o.dry, "dry-run", false, "print API calls, change nothing")
	fs.BoolVar(&o.yes, "yes", false, "no prompts; take answers from flags")
	fs.StringVar(&o.team, "team", "", "Vercel team slug or id")
	fs.StringVar(&o.project, "project", "", "Vercel project name (default grugbot-console)")
	fs.StringVar(&o.db, "db", "", "own | neon")
	fs.StringVar(&o.dbURL, "database-url", "", "Postgres URL (with --yes, DATABASE_URL works too)")
	fs.StringVar(&o.source, "source", "", "deploy this local checkout instead of the bundled app")
	_ = fs.Parse(args)
	if o.dbURL == "" && o.yes { // only in scripted runs, so a stray DATABASE_URL in your shell is never used by surprise
		o.dbURL = os.Getenv("DATABASE_URL")
	}
	o.token = os.Getenv("VERCEL_TOKEN")
	return o
}

func main() {
	if len(os.Args) < 2 {
		fmt.Print(usage)
		return
	}
	cmd, args := os.Args[1], os.Args[2:]
	var err error
	switch cmd {
	case "init":
		err = cmdInit(flags(cmd, args))
	case "doctor":
		err = cmdDoctor(flags(cmd, args))
	case "deploy":
		err = cmdDeploy(flags(cmd, args))
	case "uninstall":
		err = cmdUninstall(flags(cmd, args))
	case "version", "--version", "-v":
		fmt.Println("grugbot", version)
	case "help", "--help", "-h":
		fmt.Print(usage)
	default:
		fmt.Print(usage)
		os.Exit(2)
	}
	if err != nil {
		var sh shown
		if !errors.As(err, &sh) {
			failBox(err.Error())
		}
		os.Exit(1)
	}
}

// login gets a token from VERCEL_TOKEN or a masked prompt and checks it.
func login(o opts) (*Vercel, error) {
	tok := o.token
	if tok == "" && o.dry {
		tok = "dry-run-token"
	}
	if tok == "" {
		if o.yes || !isTTY() {
			return nil, errors.New("set VERCEL_TOKEN (create one at https://vercel.com/account/tokens)")
		}
		dim("Paste a Vercel access token: https://vercel.com/account/tokens")
		dim("It is used for this run only and never saved.")
		fmt.Println()
		if err := huh.NewInput().Title("Vercel token").EchoMode(huh.EchoModePassword).Value(&tok).
			Validate(func(s string) error {
				if len(strings.TrimSpace(s)) < 20 {
					return errors.New("that looks too short")
				}
				return nil
			}).WithTheme(theme).Run(); err != nil {
			return nil, err
		}
		tok = strings.TrimSpace(tok)
	}
	v := NewVercel(tok, o.dry)
	v.Log = func(s string) { dim("%s", s) }
	var u User
	if err := stepD("Logged in to Vercel", func() (string, error) { var e error; u, e = v.Me(); return u.User.Username, e }); err != nil {
		return nil, err
	}
	return v, nil
}

func pickTeam(v *Vercel, o opts) (Team, error) {
	teams, err := v.Teams()
	if err != nil {
		return Team{}, err
	}
	if len(teams) == 0 {
		return Team{}, errors.New("no teams on this account; create one at https://vercel.com/teams/new")
	}
	for _, t := range teams {
		if o.team != "" && (t.Slug == o.team || t.ID == o.team) {
			return t, nil
		}
	}
	if o.team != "" {
		return Team{}, fmt.Errorf("team %q not found", o.team)
	}
	if len(teams) == 1 || o.yes || !isTTY() {
		return teams[0], nil
	}
	var id string
	var opt []huh.Option[string]
	for _, t := range teams {
		opt = append(opt, huh.NewOption(t.Name+" ("+t.Slug+")", t.ID))
	}
	if err := huh.NewSelect[string]().Title("Which Vercel team?").Options(opt...).Value(&id).WithTheme(theme).Run(); err != nil {
		return Team{}, err
	}
	for _, t := range teams {
		if t.ID == id {
			return t, nil
		}
	}
	return teams[0], nil
}

func askDB(o *opts) error {
	if o.db == "" && o.dbURL != "" {
		o.db = "own"
	}
	if o.db == "" {
		if o.yes || !isTTY() {
			return errors.New("pass --db own --database-url URL, or --db neon")
		}
		if err := huh.NewSelect[string]().Title("Where should the data live?").Description("Any Postgres works. It only needs CREATE TABLE in one schema.").
			Options(huh.NewOption("Use my own Postgres", "own"), huh.NewOption("Create a free Neon database through the Vercel Marketplace", "neon")).Value(&o.db).WithTheme(theme).Run(); err != nil {
			return err
		}
	}
	if o.db != "own" || o.dbURL != "" {
		return nil
	}
	if o.yes || !isTTY() {
		return errors.New("--database-url (or DATABASE_URL) is required with --db own")
	}
	how := "url"
	_ = huh.NewSelect[string]().Title("How do you want to enter it?").Options(huh.NewOption("Paste a connection URL", "url"), huh.NewOption("Host, port, database, user, password", "parts")).Value(&how).WithTheme(theme).Run()
	if how == "url" {
		return huh.NewInput().Title("Connection URL").Description("postgres://user:password@host:5432/db?sslmode=require").EchoMode(huh.EchoModePassword).Value(&o.dbURL).
			Validate(func(s string) error {
				if !strings.HasPrefix(s, "postgres://") && !strings.HasPrefix(s, "postgresql://") {
					return errors.New("should start with postgres://")
				}
				return nil
			}).WithTheme(theme).Run()
	}
	p := DBParts{Port: "5432", SSLMode: "require"}
	err := huh.NewForm(huh.NewGroup(
		huh.NewInput().Title("Host").Value(&p.Host),
		huh.NewInput().Title("Port").Value(&p.Port),
		huh.NewInput().Title("Database").Value(&p.Name),
		huh.NewInput().Title("User").Value(&p.User),
		huh.NewInput().Title("Password").EchoMode(huh.EchoModePassword).Value(&p.Password),
		huh.NewSelect[string]().Title("sslmode").Options(huh.NewOptions("require", "verify-full", "disable")...).Value(&p.SSLMode),
	)).WithTheme(theme).Run()
	o.dbURL = p.URL()
	return err
}

func openBrowser(u string) {
	var c *exec.Cmd
	switch runtime.GOOS {
	case "darwin":
		c = exec.Command("open", u)
	case "windows":
		c = exec.Command("rundll32", "url.dll,FileProtocolHandler", u)
	default:
		c = exec.Command("xdg-open", u)
	}
	_ = c.Start()
}

func waitForNeon(v *Vercel, cfg Config, o opts) error {
	link := "https://vercel.com/marketplace/neon"
	fmt.Println()
	fmt.Println(cErrBox.BorderForeground(accent).Render(fmt.Sprintf("Create the Neon database in your browser:\n\n1. Open %s\n2. Install, pick team %s, create a free database\n3. Connect it to project %s (production + preview)\n\ngrugbot waits for DATABASE_URL to show up on the project.", link, cfg.TeamSlug, cfg.Project)))
	if !o.dry {
		openBrowser(link)
	}
	deadline := time.Now().Add(20 * time.Minute)
	return step("Waiting for Neon to add DATABASE_URL", func() error {
		for time.Now().Before(deadline) {
			keys, err := v.EnvKeys(cfg.ProjectID)
			if err != nil {
				return err
			}
			for _, k := range keys {
				if k == "DATABASE_URL" {
					return nil
				}
			}
			time.Sleep(5 * time.Second)
		}
		return errors.New("timed out after 20 minutes; run grugbot init again when it is connected")
	})
}

func cmdInit(o opts) error {
	banner("init" + map[bool]string{true: " · dry run, nothing changes", false: ""}[o.dry])
	section("Vercel")
	v, err := login(o)
	if err != nil {
		return err
	}
	team, err := pickTeam(v, o)
	if err != nil {
		return err
	}
	v.TeamID = team.ID
	ok("Team %s", cDim.Render("· ")+team.Name+cDim.Render(" ("+team.Slug+")"))
	if o.project == "" {
		o.project = "grugbot-console"
		if !o.yes && isTTY() {
			_ = huh.NewInput().Title("Project name").Value(&o.project).WithTheme(theme).Run()
		}
	}
	section("Database")
	if err := askDB(&o); err != nil {
		return err
	}
	if o.db == "own" {
		if err := stepD("Postgres reachable, CREATE TABLE works", func() (string, error) { return TestDB(o.dbURL) }); err != nil {
			return err
		}
	}
	section("Project")
	var p *Project
	if err := stepD("Project "+o.project, func() (string, error) {
		var e error
		if p, e = v.GetProject(o.project); e != nil || p != nil {
			return "already there, reusing it", e
		}
		p, e = v.CreateProject(o.project)
		return "created", e
	}); err != nil {
		return err
	}
	cfg := Config{TeamID: team.ID, TeamSlug: team.Slug, ProjectID: p.ID, Project: o.project}
	if o.db == "neon" {
		if err := waitForNeon(v, cfg, o); err != nil {
			return err
		}
	}
	token, bypass := randomSecret(40), randomSecret(32)
	env := map[string]string{"ROUTINE_LOG_TOKEN": token}
	if o.db == "own" {
		env["DATABASE_URL"] = o.dbURL
	}
	if err := stepD("Env vars set", func() (string, error) { return strings.Join(keys(env), ", "), v.SetEnv(p.ID, env) }); err != nil {
		return err
	}
	if err := stepD("Vercel Authentication on", func() (string, error) { return "team login required", v.Protect(p.ID) }); err != nil {
		return err
	}
	if err := stepD("Bypass secret created", func() (string, error) { return "for the box scripts", v.AddBypass(p.ID, bypass) }); err != nil {
		return err
	}
	section("Deploy")
	url, err := deploy(v, cfg, o)
	if err != nil {
		return err
	}
	cfg.URL = url
	if !o.dry {
		cb, _ := json.MarshalIndent(cfg, "", "  ")
		if err := write600(cfgPath(), cb); err != nil {
			return err
		}
		if err := write600(boxEnvPath(), []byte(fmt.Sprintf("ROUTINE_LOG_URL=%s\nROUTINE_LOG_TOKEN=%s\nVERCEL_BYPASS=%s\n", url, token, bypass))); err != nil {
			return err
		}
		if o.db == "own" {
			if err := write600(dbEnvPath(), []byte("DATABASE_URL="+o.dbURL+"\n")); err != nil {
				return err
			}
		}
		if err := stepD("Console answers", func() (string, error) { return "login wall up, API reachable", smoke(url, bypass) }); err != nil {
			return err
		}
	}
	db := "Neon (Vercel Marketplace)"
	if o.db == "own" {
		db = maskDSN(o.dbURL)
	}
	handoff(url, team.Slug, o.project, db)
	return nil
}

func keys(m map[string]string) []string {
	k := []string{}
	for x := range m {
		k = append(k, x)
	}
	sort.Strings(k)
	return k
}

func handoff(url, team, project, db string) {
	summary("grug console is up", [][2]string{
		{"Console", url},
		{"Team", team},
		{"Project", project},
		{"Database", db},
		{"Box secrets", boxEnvPath() + cDim.Render("  (mode 600, not printed)")},
	}, []string{
		"copy box secrets to " + cBold.Render("$INSTALL_DIR/.env") + " and chmod 600",
		"git clone https://github.com/OWNER/grokbot-routines.git",
		"INSTALL_DIR=/workspace/grugbot-console grokbot-routines/box/install.sh",
	})
	dim("or hand the secrets file to Grok Bot and ask it to install the box scripts")
	fmt.Println()
}

// smoke checks the deploy: / without login is blocked, /api/logs with the bypass answers 401 (alive, token required).
func smoke(url, bypass string) error {
	if o := os.Getenv("GRUGBOT_TEST_ORIGIN"); o != "" { // tests and the docs recording: talk to the fake instead
		url = o
	}
	c := &http.Client{Timeout: 20 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
	r, err := c.Get(url + "/")
	if err != nil {
		return err
	}
	r.Body.Close()
	if r.StatusCode == 200 {
		return errors.New("the dashboard is reachable without login; check Vercel Authentication")
	}
	req, _ := http.NewRequest("GET", url+"/api/logs?meta=1", nil)
	req.Header.Set("x-vercel-protection-bypass", bypass)
	if r, err = c.Do(req); err != nil {
		return err
	}
	r.Body.Close()
	if r.StatusCode != 200 {
		return fmt.Errorf("GET /api/logs with bypass answered %d (database or bypass problem)", r.StatusCode)
	}
	return nil
}

func deploy(v *Vercel, cfg Config, o opts) (string, error) {
	files, err := AppFiles(o.source)
	if err != nil {
		return "", err
	}
	if _, has := files["package.json"]; !has {
		return "", errors.New("this grugbot build has no app bundled; run cli/scripts/bundle.sh before go build, or pass --source path/to/checkout")
	}
	var list []File
	var mu sync.Mutex
	if err := stepD("Uploaded the app", func() (string, error) {
		sem, errs := make(chan struct{}, 8), make(chan error, len(files))
		var wg sync.WaitGroup
		quiet := *v
		quiet.Log = func(string) {}
		for _, name := range sortedKeys(files) {
			wg.Add(1)
			go func(name string, b []byte) {
				defer wg.Done()
				sem <- struct{}{}
				defer func() { <-sem }()
				sha, e := quiet.Upload(b)
				if e != nil {
					errs <- fmt.Errorf("%s: %w", name, e)
					return
				}
				mu.Lock()
				list = append(list, File{name, sha, len(b)})
				mu.Unlock()
			}(name, files[name])
		}
		wg.Wait()
		close(errs)
		return fmt.Sprintf("%d files", len(files)), <-errs
	}); err != nil {
		return "", err
	}
	if o.dry {
		v.Log(fmt.Sprintf("[dry-run] POST /v2/files x%d", len(files)))
	}
	sort.Slice(list, func(i, j int) bool { return list[i].File < list[j].File })
	var d Deployment
	if err := stepD("Production deploy ready", func() (det string, e error) {
		if d, e = v.Deploy(cfg.Project, cfg.ProjectID, list); e != nil {
			return "", e
		}
		for i := 0; i < 120 && d.ReadyState != "READY"; i++ {
			if d.ReadyState == "ERROR" || d.ReadyState == "CANCELED" {
				return "", fmt.Errorf("build %s: see https://vercel.com/%s/%s/%s", strings.ToLower(d.ReadyState), cfg.TeamSlug, cfg.Project, d.ID)
			}
			time.Sleep(5 * time.Second)
			if d, e = v.Deployment(d.ID); e != nil {
				return "", e
			}
		}
		if d.ReadyState != "READY" {
			return "", errors.New("still building after 10 minutes")
		}
		return d.ID, nil
	}); err != nil {
		return "", err
	}
	scheme := "https://"
	url := scheme + d.URL
	if p, _ := v.GetProject(cfg.ProjectID); p != nil && p.Targets.Production != nil && len(p.Targets.Production.Alias) > 0 {
		url = scheme + p.Targets.Production.Alias[0]
	}
	return url, nil
}

func cmdDeploy(o opts) error {
	banner("deploy")
	cfg, err := loadCfg()
	if err != nil && !o.dry {
		return err
	}
	if o.dry && cfg.ProjectID == "" {
		cfg = Config{TeamID: "team_dryrun", TeamSlug: "my-team", ProjectID: "prj_dryrun", Project: "grugbot-console"}
	}
	v, err := login(o)
	if err != nil {
		return err
	}
	v.TeamID, v.DryExisting = cfg.TeamID, true
	url, err := deploy(v, cfg, o)
	if err == nil {
		ok("Live at %s", url)
	}
	return err
}

func cmdDoctor(o opts) error {
	banner("doctor")
	fails := 0
	check := func(t string, fn func() error) {
		if step(t, fn) != nil {
			fails++
		}
	}
	cfg, err := loadCfg()
	if err != nil && !o.dry {
		bad("%v", err)
		return errors.New("not set up")
	}
	if o.dry && cfg.ProjectID == "" {
		cfg = Config{TeamID: "team_dryrun", TeamSlug: "my-team", ProjectID: "prj_dryrun", Project: "grugbot-console", URL: "https://grugbot-console-dryrun.vercel.app"}
	}
	ok("Config %s", cfgPath())
	check("box.env exists with mode 600", func() error {
		if o.dry {
			return nil
		}
		st, err := os.Stat(boxEnvPath())
		if err != nil {
			return err
		}
		if st.Mode().Perm() != 0o600 {
			return fmt.Errorf("mode is %o, run chmod 600 %s", st.Mode().Perm(), boxEnvPath())
		}
		return nil
	})
	if dsn := readEnvFile(dbEnvPath())["DATABASE_URL"]; dsn != "" {
		check("Database reachable and CREATE TABLE works", func() error { _, e := TestDB(dsn); return e })
	} else {
		dim("(no local db.env: Neon via Marketplace, database checked through the app below)")
	}
	v, err := login(o)
	if err != nil {
		return err
	}
	v.TeamID, v.DryExisting = cfg.TeamID, true
	var p *Project
	check("Project "+cfg.Project+" exists", func() (e error) {
		if p, e = v.GetProject(cfg.ProjectID); e == nil && p == nil {
			e = errors.New("not found")
		}
		return
	})
	check("Env vars DATABASE_URL and ROUTINE_LOG_TOKEN set", func() error {
		k, e := v.EnvKeys(cfg.ProjectID)
		if e != nil {
			return e
		}
		s := strings.Join(k, ",")
		for _, want := range []string{"DATABASE_URL", "ROUTINE_LOG_TOKEN"} {
			if !strings.Contains(s, want) {
				return fmt.Errorf("%s missing", want)
			}
		}
		return nil
	})
	check("Vercel Authentication on", func() error {
		if p == nil || p.SSO == nil {
			return errors.New("off: the dashboard would be public")
		}
		return nil
	})
	check("Latest production deploy is READY", func() error {
		d, e := v.LatestDeployment(cfg.ProjectID)
		if e != nil {
			return e
		}
		if d == nil || d.ReadyState != "READY" {
			return errors.New("no ready production deploy; run grugbot deploy")
		}
		return nil
	})
	if !o.dry {
		env := readEnvFile(boxEnvPath())
		check("Console answers (login wall up, API reachable with bypass)", func() error { return smoke(cfg.URL, env["VERCEL_BYPASS"]) })
	}
	fmt.Println()
	if fails > 0 {
		return fmt.Errorf("%d check(s) failed", fails)
	}
	ok("All good. %s", cfg.URL)
	return nil
}

func cmdUninstall(o opts) error {
	banner("uninstall")
	cfg, err := loadCfg()
	if err != nil && !o.dry {
		return err
	}
	if o.dry && cfg.ProjectID == "" {
		cfg = Config{TeamID: "team_dryrun", ProjectID: "prj_dryrun", Project: "grugbot-console"}
	}
	warn("This deletes Vercel project %s (deploys, env vars, bypass secret) and %s.", cfg.Project, home())
	dim("Your database is not touched. Drop its tables yourself if you want them gone.")
	if !o.yes {
		if !isTTY() {
			return errors.New("refusing without --yes when not in a terminal")
		}
		var typed string
		if err := huh.NewInput().Title("Type the project name to confirm").Value(&typed).WithTheme(theme).Run(); err != nil {
			return err
		}
		if typed != cfg.Project {
			return errors.New("name did not match, nothing deleted")
		}
	}
	v, err := login(o)
	if err != nil {
		return err
	}
	v.TeamID = cfg.TeamID
	if err := step("Deleted project "+cfg.Project, func() error { return v.DeleteProject(cfg.ProjectID) }); err != nil {
		return err
	}
	if o.dry {
		dim("[dry-run] would remove %s", home())
		return nil
	}
	return step("Removed "+home(), func() error { return os.RemoveAll(home()) })
}
