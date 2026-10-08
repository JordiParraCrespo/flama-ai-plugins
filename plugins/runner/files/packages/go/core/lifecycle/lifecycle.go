// Package lifecycle is a cleanup stack: what Caddy's ctx.OnCancel is to a
// module, in the shape a Go service's composition root wants.
//
// A constructor that opens something (a pool, a listener, a worker pool)
// registers how to close it the moment it exists. Close then runs every
// cleanup in reverse order of registration — the last thing opened is the
// first closed, so nothing is torn down while something built on it still
// runs — and joins their errors. The same stack serves both ends of a
// process's life: a constructor that fails halfway closes it to unwind what
// it already opened, and shutdown closes it to stop everything.
package lifecycle

import (
	"context"
	"errors"
	"fmt"
	"sync"
)

// Func closes one resource. It should return when ctx ends even if the
// resource has not finished closing; Close stops waiting at that point
// regardless.
type Func func(ctx context.Context) error

type entry struct {
	name string
	fn   Func
}

// Stack holds cleanups until Close. The zero value is ready to use, and a
// Stack is safe for concurrent use.
type Stack struct {
	mu      sync.Mutex
	entries []entry
	closing bool
	done    chan struct{}
	err     error
}

// Add registers a cleanup under a name the errors and logs refer to.
// Registering on a stack that is already closing is a programming error —
// the resource would never be closed — so it panics.
func (s *Stack) Add(name string, fn Func) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.closing {
		panic(fmt.Sprintf("lifecycle: %q added after Close", name))
	}
	s.entries = append(s.entries, entry{name: name, fn: fn})
}

// Len is the number of cleanups registered and not yet run.
func (s *Stack) Len() int {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.closing {
		return 0
	}
	return len(s.entries)
}

// Close runs the cleanups last-in first-out and returns their errors joined,
// each prefixed with its name. It is bounded by ctx: a cleanup still running
// when ctx ends is abandoned (left running, reported as an error), and the
// ones after it are skipped and reported, because running them out of order
// could close a resource the abandoned one still uses. A panic in a cleanup
// becomes its error.
//
// Close is idempotent: later calls run nothing and return the first call's
// result, waiting for it (bounded by their own ctx) if it is still running.
func (s *Stack) Close(ctx context.Context) error {
	s.mu.Lock()
	if s.closing {
		done := s.done
		s.mu.Unlock()
		select {
		case <-done:
			return s.result()
		case <-ctx.Done():
			return ctx.Err()
		}
	}
	s.closing = true
	s.done = make(chan struct{})
	entries := s.entries
	s.entries = nil
	s.mu.Unlock()

	var errs []error
	for i := len(entries) - 1; i >= 0; i-- {
		e := entries[i]
		if err := ctx.Err(); err != nil {
			errs = append(errs, fmt.Errorf("%s: skipped: %w", e.name, err))
			continue
		}
		if err := run(ctx, e.fn); err != nil {
			errs = append(errs, fmt.Errorf("%s: %w", e.name, err))
		}
	}

	s.mu.Lock()
	s.err = errors.Join(errs...)
	close(s.done)
	s.mu.Unlock()
	return s.err
}

func (s *Stack) result() error {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.err
}

// run calls fn on its own goroutine so a cleanup that ignores ctx cannot hold
// Close past the deadline.
func run(ctx context.Context, fn Func) error {
	result := make(chan error, 1)
	go func() {
		defer func() {
			if r := recover(); r != nil {
				result <- fmt.Errorf("panic: %v", r)
			}
		}()
		result <- fn(ctx)
	}()
	select {
	case err := <-result:
		return err
	case <-ctx.Done():
		return fmt.Errorf("abandoned: %w", ctx.Err())
	}
}
