package service

import (
	"context"
	"fmt"
	"log"
	"sync"
	"time"

	"xmltv-merge/internal/dvb"
	"xmltv-merge/internal/models"
)

// Multicast playout states reported by MulticastManager.
const (
	StreamStopped          = "stopped"
	StreamStarting         = "starting"
	StreamRunning          = "running"
	StreamError            = "error"
	StreamDisabledOnServer = "disabled_on_server"
)

// MulticastSettings is the server-wide multicast configuration.
type MulticastSettings struct {
	// Enabled allows streaming; when false outputs can be configured but
	// nothing is sent.
	Enabled bool
	// Interface is the default outgoing interface (name or IPv4 address).
	Interface string
	// Loopback delivers sent datagrams to local listeners too.
	Loopback bool
}

const (
	dataChangeDebounce = 5 * time.Second
	periodicRebuild    = 60 * time.Second
	reconcileInterval  = time.Minute
	maxBackoff         = time.Minute
)

// MulticastManager runs one playout goroutine per enabled multicast output.
type MulticastManager struct {
	svc      *MulticastService
	settings MulticastSettings

	mu        sync.Mutex
	runners   map[int]*streamRunner
	reconcile chan struct{}
	debounce  *time.Timer
}

// NewMulticastManager creates a manager. Call Run to start it.
func NewMulticastManager(svc *MulticastService, settings MulticastSettings) *MulticastManager {
	m := &MulticastManager{
		svc:       svc,
		settings:  settings,
		runners:   map[int]*streamRunner{},
		reconcile: make(chan struct{}, 1),
	}
	svc.OnChange = m.Reconcile
	return m
}

// StreamingEnabled reports whether this server sends multicast at all.
func (m *MulticastManager) StreamingEnabled() bool { return m.settings.Enabled }

// Run reconciles runners with the database until ctx is cancelled, then
// stops every runner.
func (m *MulticastManager) Run(ctx context.Context) {
	if !m.settings.Enabled {
		log.Printf("multicast streaming disabled (set MULTICAST_ENABLED=true to enable)")
	}
	ticker := time.NewTicker(reconcileInterval)
	defer ticker.Stop()
	m.sync(ctx)
	for {
		select {
		case <-ctx.Done():
			m.stopAll()
			return
		case <-ticker.C:
			m.sync(ctx)
		case <-m.reconcile:
			m.sync(ctx)
		}
	}
}

// Reconcile asks the manager to re-read the output configuration.
func (m *MulticastManager) Reconcile() {
	select {
	case m.reconcile <- struct{}{}:
	default:
	}
}

// DataChanged schedules a rebuild of every running carousel after imported
// programme data changed. Calls within the debounce window are merged.
func (m *MulticastManager) DataChanged() {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.debounce != nil {
		m.debounce.Stop()
	}
	m.debounce = time.AfterFunc(dataChangeDebounce, func() {
		m.mu.Lock()
		defer m.mu.Unlock()
		for _, r := range m.runners {
			r.requestRebuild()
		}
	})
}

func (m *MulticastManager) sync(ctx context.Context) {
	if _, err := m.svc.repo.RelinkMissing(ctx); err != nil {
		log.Printf("multicast: relink services: %v", err)
	}
	if !m.settings.Enabled {
		return
	}
	outputs, err := m.svc.List(ctx)
	if err != nil {
		log.Printf("multicast: list outputs: %v", err)
		return
	}
	want := map[int]models.MulticastOutput{}
	for _, o := range outputs {
		if o.Enabled {
			want[o.ID] = o
		}
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	for id, r := range m.runners {
		o, ok := want[id]
		if !ok || !o.UpdatedAt.Equal(r.updatedAt) {
			r.stop()
			delete(m.runners, id)
		}
	}
	for id, o := range want {
		if _, ok := m.runners[id]; ok {
			continue
		}
		r := newStreamRunner(m, o)
		runCtx, cancel := context.WithCancel(ctx)
		r.cancel = cancel
		m.runners[id] = r
		go r.run(runCtx)
	}
}

func (m *MulticastManager) stopAll() {
	m.mu.Lock()
	runners := m.runners
	m.runners = map[int]*streamRunner{}
	m.mu.Unlock()
	for _, r := range runners {
		r.stop()
	}
}

// Status returns the live state of output o.
func (m *MulticastManager) Status(o models.MulticastOutput) models.MulticastStatus {
	m.mu.Lock()
	r := m.runners[o.ID]
	m.mu.Unlock()
	if r != nil {
		return r.snapshot()
	}
	st := models.MulticastStatus{OutputID: o.ID, State: StreamStopped, ServicesWithoutData: make([]string, 0), CycleSeconds: o.ChunkSeconds}
	if o.Enabled && !m.settings.Enabled {
		st.State = StreamDisabledOnServer
	} else if o.Enabled {
		st.State = StreamStarting
	}
	return st
}

type streamRunner struct {
	m         *MulticastManager
	id        int
	name      string
	updatedAt time.Time
	cancel    context.CancelFunc
	done      chan struct{}
	rebuild   chan struct{}

	mu     sync.Mutex
	status models.MulticastStatus
}

func newStreamRunner(m *MulticastManager, o models.MulticastOutput) *streamRunner {
	return &streamRunner{
		m: m, id: o.ID, name: o.Name, updatedAt: o.UpdatedAt,
		done:    make(chan struct{}),
		rebuild: make(chan struct{}, 1),
		status: models.MulticastStatus{OutputID: o.ID, State: StreamStarting, CycleSeconds: o.ChunkSeconds,
			ServicesWithoutData: make([]string, 0)},
	}
}

func (r *streamRunner) requestRebuild() {
	select {
	case r.rebuild <- struct{}{}:
	default:
	}
}

func (r *streamRunner) stop() {
	if r.cancel != nil {
		r.cancel()
	}
	<-r.done
}

func (r *streamRunner) snapshot() models.MulticastStatus {
	r.mu.Lock()
	defer r.mu.Unlock()
	st := r.status
	st.ServicesWithoutData = append(make([]string, 0, len(st.ServicesWithoutData)), st.ServicesWithoutData...)
	return st
}

func (r *streamRunner) update(f func(*models.MulticastStatus)) {
	r.mu.Lock()
	f(&r.status)
	r.mu.Unlock()
}

func (r *streamRunner) run(ctx context.Context) {
	defer close(r.done)
	backoff := 5 * time.Second
	for ctx.Err() == nil {
		started := time.Now()
		err := r.session(ctx)
		if ctx.Err() != nil {
			break
		}
		if err == nil {
			continue
		}
		log.Printf("multicast output %q: %v", r.name, err)
		r.update(func(s *models.MulticastStatus) {
			s.State = StreamError
			s.LastError = err.Error()
			s.MeasuredKbps = 0
		})
		if time.Since(started) > 2*maxBackoff {
			backoff = 5 * time.Second
		}
		select {
		case <-ctx.Done():
		case <-time.After(backoff):
		}
		backoff = min(backoff*2, maxBackoff)
	}
	r.update(func(s *models.MulticastStatus) {
		s.State = StreamStopped
		s.MeasuredKbps = 0
	})
}

// session plays the output until ctx is cancelled or an error occurs.
func (r *streamRunner) session(ctx context.Context) error {
	svc := r.m.svc
	o, err := svc.Get(ctx, r.id)
	if err != nil {
		return fmt.Errorf("load output: %w", err)
	}
	if o == nil {
		<-ctx.Done()
		return nil
	}
	iface := o.Interface
	if iface == "" {
		iface = r.m.settings.Interface
	}
	sender, err := dvb.DialMulticast(o.MulticastAddress, o.MulticastPort, o.TTL, iface, r.m.settings.Loopback)
	if err != nil {
		return err
	}
	defer sender.Close()

	seed, err := svc.repo.LoadVersions(ctx, o.ID)
	if err != nil {
		return fmt.Errorf("load EIT versions: %w", err)
	}
	versions := dvb.NewMemoryVersions(seed)
	country := dvb.CountryForZone(o.Timezone)

	var current *BuildResult
	var nextRebuild time.Time
	build := func(now time.Time) error {
		// Stations are re-read on every build: channel links change when a
		// source is deleted and imported again (relink) without touching the
		// output's settings, which would otherwise restart the runner.
		fresh, err := svc.Get(ctx, o.ID)
		if err != nil {
			return fmt.Errorf("load stations: %w", err)
		}
		if fresh != nil {
			o.Services = fresh.Services
		}
		res, err := svc.Build(ctx, o, now, versions)
		if err != nil {
			return fmt.Errorf("build EIT: %w", err)
		}
		if err := svc.repo.SaveVersions(ctx, o.ID, versions.TakeDirty()); err != nil {
			return fmt.Errorf("save EIT versions: %w", err)
		}
		current = res
		nextRebuild = now.Add(periodicRebuild)
		if res.NextChange.Before(nextRebuild) {
			nextRebuild = res.NextChange
		}
		builtAt := now
		r.update(func(s *models.MulticastStatus) {
			s.LastBuildAt = &builtAt
			s.ComputedKbps = res.Carousel.Kbps()
			s.CycleSeconds = o.ChunkSeconds
			s.Sections = res.Carousel.Sections
			s.Events = res.Carousel.Events
			s.TruncatedEvents = res.Carousel.Truncated
			s.ServicesWithoutData = res.ServicesWithoutData
		})
		return nil
	}
	if err := build(time.Now()); err != nil {
		return err
	}
	startedAt := time.Now()
	r.update(func(s *models.MulticastStatus) {
		s.State = StreamRunning
		s.LastError = ""
		s.StartedAt = &startedAt
	})

	cc := dvb.ContinuityCounters{}
	next := time.Now()
	var nextTime time.Time
	var windowBytes uint64
	windowStart := time.Now()
	datagram := dvb.PacketSize * dvb.PacketsPerDatagram

	for {
		for _, slot := range current.Carousel.Slots {
			if ctx.Err() != nil {
				return nil
			}
			now := time.Now()
			select {
			case <-r.rebuild:
				nextRebuild = now
			default:
			}
			if !now.Before(nextRebuild) {
				if err := build(now); err != nil {
					return err
				}
				break
			}

			chunk := make([]byte, 0, len(slot.Packets)+datagram)
			if o.IncludeTDTTOT && !now.Before(nextTime) {
				chunk = append(chunk, dvb.TimePackets(now, current.Location, country)...)
				nextTime = now.Add(dvb.TDTInterval)
			}
			chunk = append(chunk, slot.Packets...)
			chunk = dvb.PadToDatagrams(chunk)
			cc.Apply(chunk)

			count := len(chunk) / datagram
			gap := slot.Duration / time.Duration(count)
			for off := 0; off < len(chunk); off += datagram {
				if wait := time.Until(next); wait > 0 {
					select {
					case <-ctx.Done():
						return nil
					case <-time.After(wait):
					}
				} else if wait < -time.Second {
					// Far behind (e.g. after a pause): do not burst.
					next = time.Now()
				}
				if err := sender.Send(chunk[off : off+datagram]); err != nil {
					return fmt.Errorf("send to %s:%d: %w", o.MulticastAddress, o.MulticastPort, err)
				}
				next = next.Add(gap)
				windowBytes += uint64(datagram)
				r.update(func(s *models.MulticastStatus) {
					s.PacketsSent += dvb.PacketsPerDatagram
					s.BytesSent += uint64(datagram)
				})
			}
			if elapsed := time.Since(windowStart); elapsed >= 5*time.Second {
				kbps := float64(windowBytes) * 8 / elapsed.Seconds() / 1000
				r.update(func(s *models.MulticastStatus) { s.MeasuredKbps = kbps })
				windowBytes, windowStart = 0, time.Now()
			}
		}
	}
}
