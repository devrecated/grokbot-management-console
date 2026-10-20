package main

// Terminal output. One look everywhere: a header, small section titles, indented ✓/✗ lines,
// a spinner while waiting, and a summary box at the end. Colors fall back to plain text when piped.

import (
	"fmt"
	"os"
	"strings"
	"time"

	"github.com/charmbracelet/huh"
	"github.com/charmbracelet/huh/spinner"
	"github.com/charmbracelet/lipgloss"
	"golang.org/x/term"
)

var (
	green  = lipgloss.Color("#a6e3a1")
	red    = lipgloss.Color("#f38ba8")
	yellow = lipgloss.Color("#f9e2af")
	accent = lipgloss.Color("#89b4fa")
	gray   = lipgloss.Color("#7f849c")

	cTitle   = lipgloss.NewStyle().Bold(true).Foreground(lipgloss.Color("#1e1e2e")).Background(accent).Padding(0, 1)
	cSection = lipgloss.NewStyle().Bold(true).Foreground(accent)
	cOK      = lipgloss.NewStyle().Foreground(green).Render("✓")
	cBad     = lipgloss.NewStyle().Foreground(red).Render("✗")
	cWarn    = lipgloss.NewStyle().Foreground(yellow).Render("!")
	cDim     = lipgloss.NewStyle().Foreground(gray)
	cBold    = lipgloss.NewStyle().Bold(true)
	cKey     = lipgloss.NewStyle().Foreground(gray).Width(14)
	cBox     = lipgloss.NewStyle().Border(lipgloss.RoundedBorder()).BorderForeground(green).Padding(1, 2).MarginLeft(2)
	cErrBox  = lipgloss.NewStyle().Border(lipgloss.RoundedBorder()).BorderForeground(red).Padding(0, 2).MarginLeft(2)
)

const ind = "  "

func isTTY() bool { return term.IsTerminal(int(os.Stdin.Fd())) && term.IsTerminal(int(os.Stdout.Fd())) }

func banner(sub string) {
	fmt.Println()
	fmt.Println(ind + cTitle.Render("grugbot") + " " + cDim.Render(sub))
}

func section(name string) {
	fmt.Println()
	fmt.Println(ind + cSection.Render(name))
}

func ok(f string, a ...any)   { fmt.Println(ind + cOK + " " + fmt.Sprintf(f, a...)) }
func bad(f string, a ...any)  { fmt.Println(ind + cBad + " " + fmt.Sprintf(f, a...)) }
func warn(f string, a ...any) { fmt.Println(ind + cWarn + " " + fmt.Sprintf(f, a...)) }
func dim(f string, a ...any)  { fmt.Println(ind + "  " + cDim.Render(fmt.Sprintf(f, a...))) }

// step runs fn under a spinner and prints one line after: ✓ title · detail (time if slow), or ✗ title: error.
func step(title string, fn func() error) error {
	return stepD(title, func() (string, error) { return "", fn() })
}

func stepD(title string, fn func() (string, error)) error {
	var detail string
	var err error
	t0 := time.Now()
	if isTTY() {
		_ = spinner.New().Title(" " + title).TitleStyle(lipgloss.NewStyle()).
			Style(lipgloss.NewStyle().Foreground(accent).PaddingLeft(2)).Action(func() { detail, err = fn() }).Run()
	} else {
		detail, err = fn()
	}
	if err != nil {
		bad("%s", title)
		fmt.Println(ind + "  " + lipgloss.NewStyle().Foreground(red).Render(err.Error()))
		return shown{err}
	}
	line := title
	if detail != "" {
		line += cDim.Render(" · " + detail)
	}
	if d := time.Since(t0); d > 1500*time.Millisecond {
		line += cDim.Render(fmt.Sprintf(" (%ds)", int(d.Round(time.Second).Seconds())))
	}
	ok("%s", line)
	return nil
}

// summary prints the final box: a headline, aligned key/value rows, then numbered next steps.
func summary(head string, rows [][2]string, next []string) {
	var b strings.Builder
	b.WriteString(lipgloss.NewStyle().Bold(true).Foreground(green).Render(head) + "\n\n")
	for _, r := range rows {
		b.WriteString(cKey.Render(r[0]) + r[1] + "\n")
	}
	if len(next) > 0 {
		b.WriteString("\n" + cBold.Render("Next, on the box") + "\n")
		for i, n := range next {
			b.WriteString(fmt.Sprintf("%s %s\n", cDim.Render(fmt.Sprintf("%d.", i+1)), n))
		}
	}
	fmt.Println()
	fmt.Println(cBox.Render(strings.TrimRight(b.String(), "\n")))
	fmt.Println()
}

func failBox(msg string) {
	fmt.Println()
	fmt.Println(cErrBox.Render(lipgloss.NewStyle().Foreground(red).Bold(true).Render("grugbot stopped") + "\n" + msg))
	fmt.Println()
}

// shown marks an error that step already printed, so main does not print it twice.
type shown struct{ error }

// theme makes the huh prompts match the rest of the output: Catppuccin colors, same left indent.
var theme = func() *huh.Theme {
	t := huh.ThemeCatppuccin()
	t.Focused.Base = t.Focused.Base.MarginLeft(2)
	t.Blurred.Base = t.Blurred.Base.MarginLeft(2)
	return t
}()
