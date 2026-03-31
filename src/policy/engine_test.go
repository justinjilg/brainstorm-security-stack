package policy

import (
	"encoding/json"
	"io/ioutil" // Note: ioutil is deprecated, consider using os.ReadFile or io.ReadAll
	"os"
	"path/filepath"
	"reflect"
	"sort"
	"strings"
	"testing"
)

// Helper to sort findings for consistent comparison in tests.
// Findings are sorted by AssetID then RuleID.
func sortFindings(findings []Finding) {
	sort.Slice(findings, func(i, j int) bool {
		if findings[i].AssetID != findings[j].AssetID {
			return findings[i].AssetID < findings[j].AssetID
		}
		return findings[i].RuleID < findings[j].RuleID
	})
}
