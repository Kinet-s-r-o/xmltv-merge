package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"

	"xmltv-merge/internal/auth"
	"xmltv-merge/internal/config"
	"xmltv-merge/internal/database"
	"xmltv-merge/internal/handler"
	"xmltv-merge/internal/service"
)

func main() {
	cfg := config.Load()

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	pool, err := database.Connect(ctx, cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("connect to database: %v", err)
	}
	defer pool.Close()

	importSvc := service.NewImportService(pool)
	epgSvc := service.NewEPGService(pool)
	scheduler := service.NewScheduler(pool, importSvc)
	schedulerCtx, stopScheduler := context.WithCancel(context.Background())
	defer stopScheduler()
	go scheduler.Run(schedulerCtx)

	multicastSvc := service.NewMulticastService(pool)
	multicastMgr := service.NewMulticastManager(multicastSvc, service.MulticastSettings{
		Enabled:   cfg.MulticastEnabled,
		Interface: cfg.MulticastInterface,
		Loopback:  cfg.MulticastLoopback,
	})
	importSvc.OnImported = func(int) { multicastMgr.DataChanged() }
	multicastCtx, stopMulticast := context.WithCancel(context.Background())
	multicastDone := make(chan struct{})
	go func() {
		multicastMgr.Run(multicastCtx)
		close(multicastDone)
	}()

	authSvc, err := service.NewAuthService(pool, service.AuthSettings{
		SessionIdleTimeout: cfg.AuthSessionIdle,
		SessionMaxLifetime: cfg.AuthSessionMax,
		LockAfter:          cfg.AuthLockAfter,
		LockFor:            cfg.AuthLockFor,
		SecretKey:          cfg.AuthSecretKey,
		BootstrapUsername:  cfg.AdminUsername,
		BootstrapPassword:  cfg.AdminPassword,
	})
	if err != nil {
		log.Fatalf("auth service: %v", err)
	}
	if err := authSvc.BootstrapFromEnv(ctx); err != nil {
		log.Fatalf("create first administrator: %v", err)
	}
	if required, err := authSvc.SetupRequired(ctx); err == nil && required {
		log.Printf("auth: no users exist; open the web UI to create the first administrator or set ADMIN_USERNAME and ADMIN_PASSWORD")
	}
	authCtx, stopAuth := context.WithCancel(context.Background())
	defer stopAuth()
	go authSvc.Run(authCtx)

	h := handler.NewHandler(importSvc, epgSvc, multicastSvc, multicastMgr)
	a := handler.NewAuthHandler(authSvc, handler.AuthHTTPSettings{
		CookieSecure:      cfg.AuthCookieSecure,
		TrustProxyHeaders: cfg.AuthTrustProxyHeaders,
	})

	r := chi.NewRouter()
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(securityHeaders)
	if len(cfg.CORSAllowedOrigins) > 0 {
		r.Use(cors.Handler(cors.Options{
			AllowedOrigins:   cfg.CORSAllowedOrigins,
			AllowedMethods:   []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
			AllowedHeaders:   []string{"Content-Type", handler.CSRFHeader},
			AllowCredentials: true,
			MaxAge:           300,
		}))
	}

	// Public endpoints: health, token-protected customer feeds and sign-in.
	r.Get("/api/v1/health", h.Health)
	r.Head("/api/v1/health", h.Health)
	r.Get("/feeds/{slug}.xml", h.PublicOutputXML)
	r.Get("/api/v1/auth/status", a.Status)
	r.Post("/api/v1/auth/setup", a.Setup)
	r.Post("/api/v1/auth/login", a.Login)
	r.Post("/api/v1/auth/login/verify", a.LoginVerify)
	r.Post("/api/v1/auth/logout", a.Logout)

	r.Group(func(r chi.Router) {
		r.Use(a.RequireAuth)
		read, edit, del, imp, exp := auth.ActionRead, auth.ActionEdit, auth.ActionDelete, auth.ActionImport, auth.ActionExport
		allow := handler.Allow
		const (
			dash = auth.SectionDashboard
			epg  = auth.SectionEPG
			chn  = auth.SectionChannels
			src  = auth.SectionSources
			out  = auth.SectionOutputs
			mc   = auth.SectionMulticast
			usr  = auth.SectionUsers
			rol  = auth.SectionRoles
			rad  = auth.SectionRadius
		)

		// Own account (any signed-in user).
		r.Get("/api/v1/auth/me", a.Me)
		r.Post("/api/v1/auth/password", a.ChangePassword)
		r.Post("/api/v1/auth/totp/setup", a.BeginTOTP)
		r.Post("/api/v1/auth/totp/enable", a.EnableTOTP)
		r.Post("/api/v1/auth/totp/disable", a.DisableTOTP)

		// Sources (the list also labels channels, EPG and outputs).
		r.With(allow(read, src, dash, epg, chn, out, mc)).Get("/api/v1/sources", h.ListSources)
		r.With(allow(edit, src)).Post("/api/v1/sources", h.AddSource)
		r.With(allow(exp, src)).Get("/api/v1/sources/export", h.ExportSources)
		r.With(allow(imp, src)).Post("/api/v1/sources/import/preview", h.PreviewSourceImport)
		r.With(allow(imp, src)).Post("/api/v1/sources/import", h.ImportSources)
		r.With(allow(imp, src)).Post("/api/v1/import", h.Import)
		r.With(allow(edit, src)).Put("/api/v1/sources/{id}", h.UpdateSource)
		r.With(allow(del, src)).Delete("/api/v1/sources/{id}", h.DeleteSource)
		r.With(allow(edit, src)).Post("/api/v1/sources/{id}/refresh", h.RefreshSource)
		r.With(allow(read, src)).Get("/api/v1/sources/{id}/imports", h.SourceImportLog)
		r.With(allow(edit, src)).Patch("/api/v1/sources/{id}/activation", h.SetSourceEnabled)

		// XMLTV outputs.
		r.With(allow(read, out)).Get("/api/v1/outputs", h.ListOutputs)
		r.With(allow(edit, out)).Post("/api/v1/outputs", h.AddOutput)
		r.With(allow(exp, out)).Get("/api/v1/outputs/export", h.ExportOutputs)
		r.With(allow(imp, out)).Post("/api/v1/outputs/import/preview", h.PreviewOutputImport)
		r.With(allow(imp, out)).Post("/api/v1/outputs/import", h.ImportOutputs)
		r.With(allow(read, out)).Get("/api/v1/outputs/{id}", h.GetOutput)
		r.With(allow(exp, out)).Get("/api/v1/outputs/{id}/xml", h.OutputXML)
		r.With(allow(edit, out)).Put("/api/v1/outputs/{id}", h.UpdateOutput)
		r.With(allow(del, out)).Delete("/api/v1/outputs/{id}", h.DeleteOutput)

		// Multicast DVB EIT outputs.
		r.With(allow(read, mc)).Get("/api/v1/multicast-outputs", h.ListMulticastOutputs)
		r.With(allow(edit, mc)).Post("/api/v1/multicast-outputs", h.AddMulticastOutput)
		r.With(allow(read, mc)).Get("/api/v1/multicast-outputs/status", h.MulticastStatuses)
		r.With(allow(exp, mc)).Get("/api/v1/multicast-outputs/export", h.ExportMulticastOutputs)
		r.With(allow(imp, mc)).Post("/api/v1/multicast-outputs/import/preview", h.PreviewMulticastImport)
		r.With(allow(imp, mc)).Post("/api/v1/multicast-outputs/import", h.ImportMulticastOutputs)
		r.With(allow(read, mc)).Get("/api/v1/multicast-outputs/{id}", h.GetMulticastOutput)
		r.With(allow(edit, mc)).Put("/api/v1/multicast-outputs/{id}", h.UpdateMulticastOutput)
		r.With(allow(del, mc)).Delete("/api/v1/multicast-outputs/{id}", h.DeleteMulticastOutput)
		r.With(allow(edit, mc)).Patch("/api/v1/multicast-outputs/{id}/activation", h.SetMulticastOutputEnabled)
		r.With(allow(read, mc)).Get("/api/v1/multicast-outputs/{id}/preview", h.PreviewMulticastOutput)
		r.With(allow(exp, mc)).Get("/api/v1/multicast-outputs/{id}/dump.ts", h.DumpMulticastOutput)

		// Guide data (shared by several sections).
		r.With(allow(read, chn, epg, out, mc, dash)).Get("/api/v1/channels", h.ListChannels)
		r.With(allow(read, chn, epg, out, mc, dash)).Get("/api/v1/channels/{id}", h.GetChannel)
		r.With(allow(read, epg, chn, mc)).Get("/api/v1/programmes", h.ListProgrammes)
		r.With(allow(read, epg, chn, mc)).Get("/api/v1/programmes/{id}", h.GetProgramme)

		// System: users, roles and RADIUS servers.
		r.With(allow(read, usr)).Get("/api/v1/users", a.ListUsers)
		r.With(allow(edit, usr)).Post("/api/v1/users", a.CreateUser)
		r.With(allow(read, usr)).Get("/api/v1/users/{id}", a.GetUser)
		r.With(allow(edit, usr)).Put("/api/v1/users/{id}", a.UpdateUser)
		r.With(allow(del, usr)).Delete("/api/v1/users/{id}", a.DeleteUser)
		r.With(allow(edit, usr)).Post("/api/v1/users/{id}/reset-totp", a.ResetUserTOTP)
		r.With(allow(edit, usr)).Post("/api/v1/users/{id}/unlock", a.UnlockUser)
		r.With(allow(read, rol, usr)).Get("/api/v1/roles", a.ListRoles)
		r.With(allow(edit, rol)).Post("/api/v1/roles", a.CreateRole)
		r.With(allow(edit, rol)).Put("/api/v1/roles/{id}", a.UpdateRole)
		r.With(allow(del, rol)).Delete("/api/v1/roles/{id}", a.DeleteRole)
		r.With(allow(read, rad)).Get("/api/v1/radius-servers", a.ListRadiusServers)
		r.With(allow(edit, rad)).Post("/api/v1/radius-servers", a.CreateRadiusServer)
		r.With(allow(edit, rad)).Put("/api/v1/radius-servers/{id}", a.UpdateRadiusServer)
		r.With(allow(del, rad)).Delete("/api/v1/radius-servers/{id}", a.DeleteRadiusServer)
		r.With(allow(edit, rad)).Patch("/api/v1/radius-servers/{id}/activation", a.SetRadiusServerEnabled)
		r.With(allow(edit, rad)).Post("/api/v1/radius-servers/{id}/test", a.TestRadiusServer)
	})

	srv := &http.Server{
		Addr:         ":" + cfg.Port,
		Handler:      r,
		ReadTimeout:  30 * time.Second,
		WriteTimeout: 60 * time.Second,
		IdleTimeout:  120 * time.Second,
	}

	go func() {
		log.Printf("backend listening on :%s", cfg.Port)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("server error: %v", err)
		}
	}()

	// Graceful shutdown
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Println("shutting down...")
	stopScheduler()
	stopAuth()
	stopMulticast()
	select {
	case <-multicastDone:
	case <-time.After(5 * time.Second):
	}
	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer shutdownCancel()
	srv.Shutdown(shutdownCtx)
}

// securityHeaders adds defensive headers to every backend response.
func securityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("X-Frame-Options", "DENY")
		w.Header().Set("Referrer-Policy", "same-origin")
		next.ServeHTTP(w, r)
	})
}
