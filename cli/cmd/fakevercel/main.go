// fakevercel serves the fake Vercel API on 127.0.0.1 for recording docs/init.tape. Not for real use.
package main

import (
	"fmt"
	"net/http"
	"os"

	"github.com/OWNER/grokbot-management-console/cli/fakevercel"
)

func main() {
	addr := "127.0.0.1:8787"
	if len(os.Args) > 1 {
		addr = os.Args[1]
	}
	fmt.Println("fake vercel on http://" + addr)
	_ = http.ListenAndServe(addr, fakevercel.New("grugbot-console.vercel.app"))
}
