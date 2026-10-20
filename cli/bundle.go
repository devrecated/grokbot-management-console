package main

// The web app ships inside the binary. scripts/bundle.sh copies it into appsrc/ before go build,
// so `grugbot deploy` needs no git, node or clone. --source DIR deploys a local checkout instead.

import (
	"embed"
	"io/fs"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

//go:embed all:appsrc
var appFS embed.FS

var skipDirs = map[string]bool{"node_modules": true, ".next": true, ".git": true, "box": true, "cli": true, "docs": true, ".vercel": true}

// AppFiles returns path -> bytes for everything Vercel needs to build the app.
func AppFiles(source string) (map[string][]byte, error) {
	var fsys fs.FS
	if source != "" {
		fsys = os.DirFS(source)
	} else {
		sub, err := fs.Sub(appFS, "appsrc")
		if err != nil {
			return nil, err
		}
		fsys = sub
	}
	out := map[string][]byte{}
	err := fs.WalkDir(fsys, ".", func(p string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		base := filepath.Base(p)
		if d.IsDir() {
			if p != "." && skipDirs[base] {
				return fs.SkipDir
			}
			return nil
		}
		if base == ".gitkeep" || strings.HasPrefix(base, ".env") || base == ".DS_Store" {
			return nil
		}
		b, err := fs.ReadFile(fsys, p)
		if err != nil {
			return err
		}
		out[filepath.ToSlash(p)] = b
		return nil
	})
	return out, err
}

func sortedKeys(m map[string][]byte) []string {
	k := make([]string, 0, len(m))
	for x := range m {
		k = append(k, x)
	}
	sort.Strings(k)
	return k
}
