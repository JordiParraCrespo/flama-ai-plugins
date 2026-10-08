package ws

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"reflect"
	"strings"
	"testing"

	"github.com/jordiparracrespo/flama-ai/packages/go/auth"
	"github.com/jordiparracrespo/flama-ai/packages/go/auth/scope"
	"github.com/jordiparracrespo/flama-ai/packages/go/core/problem"
)

// Every frame a client sends is decoded into an Envelope and handled by
// conn.handle. These targets cover both halves without a socket.

func envelopeSeeds(f *testing.F) {
	for _, s := range []string{
		`{"type":"subscribe","id":"1","topics":["jobs"]}`,
		`{"type":"subscribe","id":"2","topics":["jobs/abc","jobs/abc","private"]}`,
		`{"type":"unsubscribe","id":"3","topics":["jobs","nope"]}`,
		`{"type":"ping","id":"p"}`,
		`{"type":"subscribe","topics":[]}`,
		`{"type":"subscribe","topics":null}`,
		`{"type":"event","topic":"jobs","event":"job.started","payload":{"a": [1, 2.5e3, null]}}`,
		`{"type":"error","error":{"code":"RUNNER_001","detail":"x"}}`,
		`{"type":"error","error":{}}`,
		`{"type":"hello","payload":"str"}`,
		`{"type":"\u0000","id":"\ud800"}`,
		`{"TYPE":"ping","Id":"case"}`,
		`{"type":"ping","type":"subscribe","topics":["jobs"]}`,
		`{"type":1}`, `[]`, `null`, `{}`, `"x"`, ``, `{"type":"subscribe","topics":["` + strings.Repeat("a", 200) + `"]}`,
	} {
		f.Add([]byte(s))
	}
}

// FuzzEnvelopeRoundTrip: whatever decodes re-encodes to an envelope that
// decodes to the same value, so what the server echoes back (topics, id) is
// what the client sent.
func FuzzEnvelopeRoundTrip(f *testing.F) {
	envelopeSeeds(f)
	f.Fuzz(func(t *testing.T, data []byte) {
		var in Envelope
		if err := json.Unmarshal(data, &in); err != nil {
			return
		}
		out, err := json.Marshal(in)
		if err != nil {
			t.Fatalf("decoded %q but cannot re-encode: %v", data, err)
		}
		var again Envelope
		if err := json.Unmarshal(out, &again); err != nil {
			t.Fatalf("re-encoded %q does not decode: %v", out, err)
		}
		if !reflect.DeepEqual(normalize(in), normalize(again)) {
			t.Fatalf("round trip changed the envelope:\n in  %#v\n out %#v", in, again)
		}
	})
}

// normalize folds the differences encoding/json introduces on purpose:
// omitempty drops an empty topic list, and a RawMessage is re-encoded
// compacted and HTML-escaped (`&` becomes `\u0026`). Payloads are compared
// by value, numbers kept exact.
func normalize(e Envelope) Envelope {
	if len(e.Topics) == 0 {
		e.Topics = nil
	}
	if len(e.Payload) > 0 {
		dec := json.NewDecoder(bytes.NewReader(e.Payload))
		dec.UseNumber()
		var v any
		if dec.Decode(&v) == nil {
			if canon, err := json.Marshal(v); err == nil {
				e.Payload = canon
			}
		}
	}
	if string(e.Payload) == "null" {
		e.Payload = nil
	}
	return e
}

// FuzzHandle drives a decoded envelope through the session logic with an
// authorizer that allows only `jobs` topics. It checks the rules a client
// must not be able to break: every answer carries the request's id, a
// denied topic is never subscribed, and MaxTopics holds.
func FuzzHandle(f *testing.F) {
	envelopeSeeds(f)
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	principal := &auth.Principal{ID: "k", Kind: auth.KindAPIKey, Scopes: scope.NewSet("events:read")}
	authorize := func(_ context.Context, _ *auth.Principal, topic string) error {
		if topic != "jobs" && !strings.HasPrefix(topic, "jobs/") {
			return problem.ErrNotFound.WithDetail("unknown topic %q", topic)
		}
		return nil
	}
	opts := DefaultOptions()
	opts.MaxTopics = 4

	f.Fuzz(func(t *testing.T, data []byte) {
		hub := NewHub(logger, opts)
		c := newConn(hub, nil)
		// Never full: a full queue would close the (absent) socket.
		c.send = make(chan []byte, 8)

		// Two frames: the second sees the first's subscriptions, which is
		// where MaxTopics and duplicates interact.
		for i := 0; i < 2; i++ {
			var in Envelope
			if err := json.Unmarshal(data, &in); err != nil {
				return
			}
			c.handle(context.Background(), principal, in, authorize)

			select {
			case frame := <-c.send:
				var reply Envelope
				if err := json.Unmarshal(frame, &reply); err != nil {
					t.Fatalf("server sent an undecodable frame %q", frame)
				}
				if reply.ID != in.ID {
					t.Fatalf("reply id %q for request id %q", reply.ID, in.ID)
				}
				if reply.Type == TypeError && (reply.Error == nil || reply.Error.Code == "") {
					t.Fatalf("error frame without a code: %s", frame)
				}
			default:
				t.Fatalf("no reply to %q", data)
			}

			if len(c.topics) > opts.MaxTopics {
				t.Fatalf("%d subscriptions past MaxTopics %d", len(c.topics), opts.MaxTopics)
			}
			for topic := range c.topics {
				if authorize(context.Background(), principal, topic) != nil {
					t.Fatalf("subscribed to denied topic %q", topic)
				}
				if _, ok := hub.topics[topic][c]; !ok {
					t.Fatalf("conn and hub disagree on %q", topic)
				}
			}
			for topic, subs := range hub.topics {
				if _, ok := subs[c]; ok {
					if _, mine := c.topics[topic]; !mine {
						t.Fatalf("hub lists a subscription the conn does not have: %q", topic)
					}
				}
			}
		}
	})
}
