package main

import (
	"fmt"
	"os"

	"github.com/charmbracelet/huh/spinner"
	"github.com/charmbracelet/lipgloss"
	"golang.org/x/term"
)

var (
	cTitle = lipgloss.NewStyle().Bold(true).Foreground(lipgloss.Color("#f5f5f5")).Background(lipgloss.Color("#2f6f4e")).Padding(0, 1)
	cOK    = lipgloss.NewStyle().Foreground(lipgloss.Color("#3fb950")).Render("✓")
	cBad   = lipgloss.NewStyle().Foreground(lipgloss.Color("#f85149")).Render("✗")
	cWarn  = lipgloss.NewStyle().Foreground(lipgloss.Color("#d29922")).Render("!")
	cDim   = lipgloss.NewStyle().Foreground(lipgloss.Color("#8b949e"))
	cBold  = lipgloss.NewStyle().Bold(true)
	cBox   = lipgloss.NewStyle().Border(lipgloss.RoundedBorder()).BorderForeground(lipgloss.Color("#2f6f4e")).Padding(0, 1)
)

func isTTY() bool { return term.IsTerminal(int(os.Stdin.Fd())) && term.IsTerminal(int(os.Stdout.Fd())) }

func banner(sub string) {
	fmt.Println(cTitle.Render("grugbot") + " " + cDim.Render(sub))
	fmt.Println()
}
func ok(f string, a ...any)   { fmt.Println(cOK, fmt.Sprintf(f, a...)) }
func bad(f string, a ...any)  { fmt.Println(cBad, fmt.Sprintf(f, a...)) }
func warn(f string, a ...any) { fmt.Println(cWarn, fmt.Sprintf(f, a...)) }
func dim(f string, a ...any)  { fmt.Println(cDim.Render(fmt.Sprintf(f, a...))) }

// step runs fn under a spinner (plain line when not a terminal) and prints ✓ or ✗ after.
func step(title string, fn func() error) error {
	var err error
	if isTTY() {
		_ = spinner.New().Title(" " + title).Action(func() { err = fn() }).Run()
	} else {
		err = fn()
	}
	if err != nil {
		bad("%s: %v", title, err)
		return shown{err}
	} else {
		ok("%s", title)
	}
	return err
}

// shown marks an error that step already printed, so main does not print it twice.
type shown struct{ error }
