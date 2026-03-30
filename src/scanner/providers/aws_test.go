package providers

import (
	"context"
	"sync"
	"testing"
	"time"
)

func TestExampleFunction(t *testing.T) {
	// Example test implementation
	ctx := context.Background()
	var wg sync.WaitGroup
	wg.Add(1)

	go func() {
		defer wg.Done()
		select {
		case <-ctx.Done():
			t.Error("context canceled unexpectedly")
		case <-time.After(1 * time.Second):
			// Simulate some work
		}
	}()

	wg.Wait()
	if ctx.Err() != nil {
		t.Errorf("unexpected context error: %v", ctx.Err())
	}
}
